-- RONA — Phase 4: halaman publik dan sistem publish/unpublish.
-- IDEMPOTEN dan ADITIF: tidak mengubah migration lama, tidak menghapus data. Fungsi yang sudah ada diganti dengan
-- `create or replace` (tanda tangan sama) hanya untuk menambah versi/waktu publikasi dan penguncian.
-- Kontrak yang dipakai ulang (tidak diubah): publish_page() (atomik, mengunci baris page, membuat snapshot immutable),
-- published_snapshots, kolom *_published_path (hanya bisa ditulis fungsi database, bukan client).
-- Isi:
--   1. build_draft_payload(): payload draft berbentuk SAMA dengan snapshot (untuk mendeteksi "perubahan belum terbit")
--   2. publish_page_with_assets(): menautkan salinan aset publik lalu menerbitkan DALAM SATU TRANSAKSI
--   3. get_publish_state(): status publikasi milik pemanggil
--   4. get_public_page(): kini menyertakan version dan published_at
--   5. unpublish_page(): dikunci agar tidak berlomba dengan publish
--   6. Penutupan celah: publish_page() tidak lagi dapat dipanggil langsung oleh client dan kolom *_published_path
--      tidak lagi dapat ditulis client (client bisa memalsukan path publik bila dibiarkan)

------------------------------------------------------------------------------
-- 1. Payload draft (bentuk identik dengan publish_page(); path = path DRAFT)
------------------------------------------------------------------------------
create or replace function public.build_draft_payload(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'username', pr.username,
      'display_name', pr.display_name,
      'bio', pr.bio,
      'avatar_path', pr.avatar_path
    ),
    'background_path', pg.background_path,
    'config', pg.draft_config,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'description', l.description, 'url', l.url,
        'aspect_ratio', l.aspect_ratio, 'bg_color', l.bg_color,
        'image_path', l.image_path, 'config', l.config
      ) order by l.position)
      from public.page_links l where l.page_id = pg.id and l.is_visible), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ci.id, 'title', ci.title, 'description', ci.description,
        'cta_type', ci.cta_type, 'cta_label', ci.cta_label,
        'cta_value', ci.cta_value, 'cta_message', ci.cta_message,
        'images', coalesce((
          select jsonb_agg(i.published_path order by i.position)
          from public.catalog_images i where i.item_id = ci.id), '[]'::jsonb)
      ) order by ci.position)
      from public.catalog_items ci where ci.page_id = pg.id and ci.is_visible), '[]'::jsonb)
  )
  from public.profiles pr join public.pages pg on pg.owner_id = pr.id
  where pr.id = p_uid
$$;
revoke all on function public.build_draft_payload(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. Publish dengan aset — satu transaksi
--    Aplikasi (server) menyalin gambar draft -> public-assets LEBIH DULU, lalu memanggil fungsi ini.
--    Aturan keras: path publik HARUS sama persis dengan path draft milik entitas itu (nama objek acak dan
--    immutable), berada di folder pemanggil, dan objeknya benar-benar ada di bucket public-assets.
--    Path arbitrer dari client tidak dapat lolos. Bila ada yang gagal, seluruh transaksi dibatalkan:
--    snapshot live sebelumnya tidak tersentuh.
------------------------------------------------------------------------------
create or replace function public.publish_page_with_assets(
  p_avatar text default null,
  p_background text default null,
  p_links jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.pages%rowtype;
  v_profile public.profiles%rowtype;
  v_link record;
  v_wanted text;
  v_version integer;
  v_pat text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_page from public.pages where owner_id = v_uid for update;  -- serialisasi publish bersamaan
  if not found then
    raise exception 'page_not_found' using errcode = 'P0002';
  end if;
  select * into v_profile from public.profiles where id = v_uid;

  if jsonb_typeof(coalesce(p_links, '{}'::jsonb)) <> 'object' then
    raise exception 'assets_invalid' using errcode = '22023';
  end if;

  -- Validasi halaman minimum (juga divalidasi di server aplikasi, di sini sebagai pertahanan terakhir).
  if v_profile.display_name is null or btrim(v_profile.display_name) = '' then
    raise exception 'display_name_required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.page_links l where l.page_id = v_page.id and l.is_visible) then
    raise exception 'no_visible_links' using errcode = '23514';
  end if;
  if exists (select 1 from public.page_links l where l.page_id = v_page.id and l.is_visible
             and l.url !~* '^(https?://[^[:space:]]+|mailto:[^[:space:]]+|tel:\+?[0-9()-]{3,30})$') then
    raise exception 'link_url_invalid' using errcode = '23514';
  end if;

  -- Avatar
  v_pat := '^' || v_uid::text || '/avatar/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$';
  if v_profile.avatar_path is null then
    if p_avatar is not null then raise exception 'assets_invalid' using errcode = '22023'; end if;
    update public.profiles set avatar_published_path = null where id = v_uid and avatar_published_path is not null;
  else
    if p_avatar is distinct from v_profile.avatar_path or p_avatar !~ v_pat
       or not exists (select 1 from storage.objects o where o.bucket_id = 'public-assets' and o.name = p_avatar) then
      raise exception 'assets_not_published' using errcode = '23514';
    end if;
    update public.profiles set avatar_published_path = p_avatar where id = v_uid;
  end if;

  -- Latar
  v_pat := '^' || v_uid::text || '/background/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$';
  if v_page.background_path is null then
    if p_background is not null then raise exception 'assets_invalid' using errcode = '22023'; end if;
    update public.pages set background_published_path = null where id = v_page.id and background_published_path is not null;
  else
    if p_background is distinct from v_page.background_path or p_background !~ v_pat
       or not exists (select 1 from storage.objects o where o.bucket_id = 'public-assets' and o.name = p_background) then
      raise exception 'assets_not_published' using errcode = '23514';
    end if;
    update public.pages set background_published_path = p_background where id = v_page.id;
  end if;

  -- Gambar link (hanya link yang tampil ikut terbit; peta p_links: {"<link-id>": "<path>"})
  v_pat := '^' || v_uid::text || '/link/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$';
  for v_link in
    select l.id, l.image_path from public.page_links l
    where l.page_id = v_page.id and l.is_visible and l.image_path is not null
  loop
    v_wanted := p_links ->> v_link.id::text;
    if v_wanted is distinct from v_link.image_path or v_wanted !~ v_pat
       or not exists (select 1 from storage.objects o where o.bucket_id = 'public-assets' and o.name = v_wanted) then
      raise exception 'assets_not_published' using errcode = '23514';
    end if;
    update public.page_links set image_published_path = v_wanted where id = v_link.id;
  end loop;
  -- Link tampil tanpa gambar: pastikan tidak ada sisa path publik lama.
  update public.page_links set image_published_path = null
   where page_id = v_page.id and is_visible and image_path is null and image_published_path is not null;

  -- Peta tidak boleh memuat id yang bukan link tampil milik pemanggil (menolak muatan asing).
  if exists (select 1 from jsonb_object_keys(coalesce(p_links, '{}'::jsonb)) k
             where not exists (select 1 from public.page_links l
                               where l.id::text = k and l.page_id = v_page.id and l.is_visible and l.image_path is not null)) then
    raise exception 'assets_invalid' using errcode = '22023';
  end if;

  -- Katalog (fase berikutnya): path publik gambar katalog yang tampil harus berpola milik pemanggil dan ada di bucket.
  if exists (
    select 1 from public.catalog_images i join public.catalog_items ci on ci.id = i.item_id
    where ci.page_id = v_page.id and ci.is_visible
      and (i.published_path is null
           or i.published_path !~ ('^' || v_uid::text || '/catalog/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$')
           or not exists (select 1 from storage.objects o where o.bucket_id = 'public-assets' and o.name = i.published_path))
  ) then
    raise exception 'assets_not_published' using errcode = '23514';
  end if;

  -- publish_page() memeriksa ulang aset dan membuat snapshot; kegagalan apa pun membatalkan semuanya.
  v_version := public.publish_page();
  return v_version;
end;
$$;
revoke all on function public.publish_page_with_assets(text, text, jsonb) from public, anon;
grant execute on function public.publish_page_with_assets(text, text, jsonb) to authenticated;

------------------------------------------------------------------------------
-- 3. Status publikasi milik pemanggil
------------------------------------------------------------------------------
create or replace function public.get_publish_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.pages%rowtype;
  v_snap public.published_snapshots%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_page from public.pages where owner_id = v_uid;
  if not found then
    raise exception 'page_not_found' using errcode = 'P0002';
  end if;
  if v_page.published_snapshot_id is not null then
    select * into v_snap from public.published_snapshots where id = v_page.published_snapshot_id;
  end if;
  return jsonb_build_object(
    'is_published', v_page.is_published,
    'version', v_snap.version,                 -- versi terakhir yang pernah terbit (null bila belum pernah)
    'published_at', v_snap.created_at,
    'has_changes', v_snap.id is null
                   or public.build_draft_payload(v_uid) is distinct from v_snap.payload  -- dibanding versi TERAKHIR terbit
  );
end;
$$;
revoke all on function public.get_publish_state() from public, anon;
grant execute on function public.get_publish_state() to authenticated;

------------------------------------------------------------------------------
-- 4. get_public_page: tambahkan version dan published_at (hanya dari snapshot; tidak pernah membaca draft)
------------------------------------------------------------------------------
create or replace function public.get_public_page(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.payload || jsonb_build_object('version', s.version, 'published_at', s.created_at)
  from public.profiles pr
  join public.pages pg on pg.owner_id = pr.id
  join public.published_snapshots s on s.id = pg.published_snapshot_id
  where pr.username = lower(p_username)
    and pg.is_published
$$;
revoke all on function public.get_public_page(text) from public;
grant execute on function public.get_public_page(text) to anon, authenticated;

------------------------------------------------------------------------------
-- 5. unpublish_page: dikunci; mengembalikan true bila memang berubah dari terbit -> tidak terbit
------------------------------------------------------------------------------
drop function if exists public.unpublish_page();
create function public.unpublish_page()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page public.pages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_page from public.pages where owner_id = auth.uid() for update;
  if not found then
    raise exception 'page_not_found' using errcode = 'P0002';
  end if;
  if not v_page.is_published then
    return false;
  end if;
  update public.pages set is_published = false where id = v_page.id;
  return true;
end;
$$;
revoke all on function public.unpublish_page() from public, anon;
grant execute on function public.unpublish_page() to authenticated;

------------------------------------------------------------------------------
-- 6. Penutupan celah
--    (a) publish_page() hanya boleh dipanggil dari dalam publish_page_with_assets() (SECURITY DEFINER, pemilik
--        fungsi tetap berhak). Client yang memanggil langsung dapat memasukkan path publik palsu ke snapshot.
--    (b) Kolom *_published_path hanya boleh ditulis fungsi database. Revoke di tingkat tabel lalu grant per kolom
--        (revoke tingkat kolom tidak berefek bila grant tabel ada). Kolom yang boleh ditulis client sama dengan
--        yang sudah dipakai aplikasi; RLS tetap berlaku.
------------------------------------------------------------------------------
revoke all on function public.publish_page() from public, anon, authenticated;

revoke insert, update on public.profiles from authenticated;
grant insert (id, username, display_name, bio, avatar_path) on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_path) on public.profiles to authenticated;

revoke insert, update on public.page_links from authenticated;
grant insert (page_id, position, title, description, url, aspect_ratio, bg_color, image_path, config, is_visible)
  on public.page_links to authenticated;
grant update (position, title, description, url, aspect_ratio, bg_color, image_path, config, is_visible)
  on public.page_links to authenticated;

revoke insert, update on public.catalog_images from authenticated;
grant insert (item_id, position, storage_path) on public.catalog_images to authenticated;
grant update (position, storage_path) on public.catalog_images to authenticated;
