-- RONA — Phase 1: onboarding (klaim username), aset latar halaman, dan policy storage per jenis aset.
-- Tambahan non-destruktif di atas 20261016000000_foundation.sql: tidak ada DROP TABLE / DROP COLUMN,
-- tidak ada data yang dihapus. Satu-satunya DROP adalah policy storage milik migration foundation
-- (diganti versi yang lebih ketat di bawah) dan fungsi diganti dengan CREATE OR REPLACE.

------------------------------------------------------------------------------
-- 1. Background halaman (rasio 9:16) — draft privat + salinan publik saat publish
------------------------------------------------------------------------------
alter table public.pages
  add column if not exists background_path text,
  add column if not exists background_published_path text;

-- Client hanya boleh mengedit draft; background_published_path diisi server saat publish.
grant update (background_path) on public.pages to authenticated;

------------------------------------------------------------------------------
-- 2. Onboarding: cek ketersediaan & klaim username (atomik: profil + page)
------------------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(btrim(coalesce(p_username, ''))) ~ '^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$'
    and not exists (select 1 from public.reserved_usernames r
                    where r.name = lower(btrim(p_username)))
    and not exists (select 1 from public.profiles p
                    where p.username = lower(btrim(p_username)))
$$;

-- Satu transaksi: jika salah satu langkah gagal, tidak ada profil setengah jadi.
-- Identitas dari auth.uid(), bukan dari parameter.
create or replace function public.claim_username(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_page_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_exists' using errcode = '23505';
  end if;
  if v_name !~ '^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$' then
    raise exception 'username_invalid' using errcode = '23514';
  end if;

  begin
    insert into public.profiles (id, username) values (v_uid, v_name);
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;

  insert into public.pages (owner_id) values (v_uid) returning id into v_page_id;
  return v_page_id;
end;
$$;

revoke all on function public.is_username_available(text) from public;
revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.claim_username(text) to authenticated;

------------------------------------------------------------------------------
-- 3. publish_page(): tambah validasi avatar & background + sertakan background di payload
------------------------------------------------------------------------------
create or replace function public.publish_page()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.pages%rowtype;
  v_profile public.profiles%rowtype;
  v_version integer;
  v_snapshot_id uuid;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_page from public.pages where owner_id = v_uid for update;
  if not found then
    raise exception 'page_not_found' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  -- Semua gambar yang ikut terbit harus sudah punya salinan publik.
  if (v_profile.avatar_path is not null and v_profile.avatar_published_path is null)
     or (v_page.background_path is not null and v_page.background_published_path is null)
     or exists (select 1 from public.page_links l
                where l.page_id = v_page.id and l.is_visible
                  and l.image_path is not null and l.image_published_path is null)
     or exists (select 1 from public.catalog_images i
                join public.catalog_items ci on ci.id = i.item_id
                where ci.page_id = v_page.id and ci.is_visible and i.published_path is null)
  then
    raise exception 'assets_not_published' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'username', v_profile.username,
      'display_name', v_profile.display_name,
      'bio', v_profile.bio,
      'avatar_path', v_profile.avatar_published_path
    ),
    'background_path', v_page.background_published_path,
    'config', v_page.draft_config,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'description', l.description, 'url', l.url,
        'aspect_ratio', l.aspect_ratio, 'bg_color', l.bg_color,
        'image_path', l.image_published_path, 'config', l.config
      ) order by l.position)
      from public.page_links l where l.page_id = v_page.id and l.is_visible), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ci.id, 'title', ci.title, 'description', ci.description,
        'cta_type', ci.cta_type, 'cta_label', ci.cta_label,
        'cta_value', ci.cta_value, 'cta_message', ci.cta_message,
        'images', coalesce((
          select jsonb_agg(i.published_path order by i.position)
          from public.catalog_images i where i.item_id = ci.id), '[]'::jsonb)
      ) order by ci.position)
      from public.catalog_items ci where ci.page_id = v_page.id and ci.is_visible), '[]'::jsonb)
  ) into v_payload;

  select coalesce(max(version), 0) + 1 into v_version
  from public.published_snapshots where page_id = v_page.id;

  insert into public.published_snapshots (page_id, version, payload)
  values (v_page.id, v_version, v_payload)
  returning id into v_snapshot_id;

  update public.pages
     set is_published = true, published_snapshot_id = v_snapshot_id
   where id = v_page.id;

  return v_version;
end;
$$;

------------------------------------------------------------------------------
-- 4. Storage: struktur path per jenis aset + akses per bucket
------------------------------------------------------------------------------
-- Konvensi objek (kedua bucket):  <uid>/<jenis>/<nama-file>.<jpg|jpeg|png|webp>
--   jenis = avatar | background | link | catalog
-- Akses:
--   draft-assets  (PRIVAT)  : hanya pemilik (baca/tulis/hapus). Tidak pernah publik.
--   public-assets (PUBLIK)  : berisi HANYA salinan yang sudah dipublikasikan. URL langsung dapat
--                             dibaca siapa pun (itu tujuannya), tetapi tidak ada policy SELECT,
--                             sehingga daftar/enumerasi objek lewat API tidak tersedia. Tulis hanya
--                             pemilik, hanya ke foldernya sendiri dengan struktur di atas.
-- Batas ukuran (5 MB) dan MIME (jpeg/png/webp) dipaksa di level bucket (lihat migration foundation).
-- Ekstensi + pola nama dipaksa di policy; validasi isi file (magic bytes, dimensi) tetap di server.
drop policy if exists draft_assets_owner_all on storage.objects;
drop policy if exists public_assets_owner_write on storage.objects;

-- draft-assets
create policy draft_assets_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'draft-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy draft_assets_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'draft-assets'
    and name ~ ('^' || (select auth.uid())::text || '/(avatar|background|link|catalog)/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$'));
create policy draft_assets_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'draft-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'draft-assets'
    and name ~ ('^' || (select auth.uid())::text || '/(avatar|background|link|catalog)/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$'));
create policy draft_assets_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'draft-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- public-assets (tanpa SELECT policy — lihat catatan di atas)
create policy public_assets_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'public-assets'
    and name ~ ('^' || (select auth.uid())::text || '/(avatar|background|link|catalog)/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$'));
create policy public_assets_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'public-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'public-assets'
    and name ~ ('^' || (select auth.uid())::text || '/(avatar|background|link|catalog)/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$'));
create policy public_assets_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'public-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
