-- RONA — Phase 5: katalog layanan/produk/karya.
-- IDEMPOTEN dan ADITIF: tidak mengubah migration lama, tidak menghapus data. Tabel catalog_items / catalog_images sudah
-- ada sejak fondasi (RLS pemilik, maksimal 7 gambar lewat posisi 0..6); migration ini memperluasnya.
-- Satu-satunya perubahan bentuk constraint: unique (item_id, position) dijadikan DEFERRABLE agar urutan foto dapat
-- ditukar dalam satu pernyataan (data tidak disentuh).
-- Isi:
--   1. Kolom baru: ringkasan, harga, label harga, foto sampul, thumbnail + metadata gambar
--   2. Constraint format CTA (NOT VALID: hanya berlaku untuk tulis baru; tidak memindai data lama)
--   3. Trigger penjaga item (batas 30 item, posisi otomatis) dan gambar (batas 7, posisi, path milik pemilik,
--      objek harus ada di draft-assets, sampul otomatis)
--   4. RPC: reorder_catalog_items, reorder_catalog_images, set_catalog_cover, set_catalog_settings
--   5. build_catalog_payload(): (section nonaktif => katalog tidak masuk snapshot) SATU sumber bentuk payload katalog untuk draft dan snapshot
--   6. build_draft_payload() dan publish_page() memakai fungsi itu (alur publish TUNGGAL milik Phase 4)
--   7. publish_page_with_assets(): memverifikasi salinan publik gambar katalog lalu menautkannya
--   8. Grant kolom: client tidak dapat menulis posisi, sampul, atau path publik

------------------------------------------------------------------------------
-- 1. Kolom baru
------------------------------------------------------------------------------
alter table public.catalog_items
  add column if not exists summary text check (char_length(summary) <= 160),
  add column if not exists price_amount bigint check (price_amount >= 0 and price_amount <= 999999999999),
  add column if not exists price_label text check (char_length(price_label) <= 40),
  add column if not exists cover_image_id uuid;

alter table public.catalog_images
  add column if not exists thumb_path text,
  add column if not exists thumb_published_path text,
  add column if not exists width integer check (width between 1 and 16384),
  add column if not exists height integer check (height between 1 and 16384),
  add column if not exists size_bytes integer check (size_bytes > 0),
  add column if not exists mime text check (mime in ('image/jpeg', 'image/png', 'image/webp'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_cover_fk'
                 and conrelid = 'public.catalog_items'::regclass) then
    alter table public.catalog_items
      add constraint catalog_items_cover_fk foreign key (cover_image_id)
      references public.catalog_images (id) on delete set null;
  end if;

  -- unique (item_id, position) -> deferrable
  if exists (select 1 from pg_constraint where conname = 'catalog_images_item_position_key'
             and conrelid = 'public.catalog_images'::regclass and not condeferrable) then
    alter table public.catalog_images drop constraint catalog_images_item_position_key;
    alter table public.catalog_images
      add constraint catalog_images_item_position_key unique (item_id, position) deferrable initially immediate;
  end if;
end $$;

------------------------------------------------------------------------------
-- 2. Format CTA (cermin validasi aplikasi; pertahanan terakhir bila request dimanipulasi)
--    whatsapp: hanya digit internasional 8–15 (tanpa +). url: HANYA https. email / telepon: pola ketat.
--    NOT VALID: tidak memeriksa baris lama, tetapi menegakkan semua penulisan baru.
------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_cta_format'
                 and conrelid = 'public.catalog_items'::regclass) then
    alter table public.catalog_items
      add constraint catalog_items_cta_format
      check (cta_value is null or (cta_type is not null and (
        (cta_type = 'whatsapp' and cta_value ~ '^[0-9]{8,15}$')
        or (cta_type = 'url' and cta_value ~* '^https://[^[:space:]]+$' and cta_value !~ '[[:cntrl:]]')
        or (cta_type = 'email' and cta_value ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$')
        or (cta_type = 'phone' and cta_value ~ '^\+?[0-9()-]{3,30}$')
      ))) not valid;
  end if;
end $$;

------------------------------------------------------------------------------
-- 3a. Penjaga item
------------------------------------------------------------------------------
create or replace function public.catalog_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.page_id::text || ':catalog'));
  select count(*), coalesce(max(position), -1) into v_count, v_max
    from public.catalog_items where page_id = new.page_id;
  if v_count >= 30 then
    raise exception 'catalog_item_limit_reached' using errcode = '23514';
  end if;
  new.position := v_max + 1;   -- selalu di akhir; urutan lain lewat reorder_catalog_items()
  new.cover_image_id := null;  -- sampul hanya diatur trigger/RPC
  return new;
end;
$$;
revoke all on function public.catalog_items_guard() from public, anon, authenticated;

drop trigger if exists catalog_items_guard on public.catalog_items;
create trigger catalog_items_guard
  before insert on public.catalog_items
  for each row execute function public.catalog_items_guard();

------------------------------------------------------------------------------
-- 3b. Penjaga gambar
------------------------------------------------------------------------------
create or replace function public.catalog_images_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pat text;
  v_count integer;
  v_pos integer;
begin
  if v_uid is not null then
    -- Item harus milik pemanggil (tanpa membocorkan keberadaan item orang lain).
    if not exists (select 1 from public.catalog_items ci join public.pages p on p.id = ci.page_id
                   where ci.id = new.item_id and p.owner_id = v_uid) then
      raise exception 'catalog_item_not_found' using errcode = '42501';
    end if;
    v_pat := '^' || v_uid::text || '/catalog/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$';
    if new.storage_path !~ v_pat or (new.thumb_path is not null and new.thumb_path !~ v_pat) then
      raise exception 'image_path_invalid' using errcode = '23514';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'draft-assets' and o.name = new.storage_path)
       or (new.thumb_path is not null
           and not exists (select 1 from storage.objects o where o.bucket_id = 'draft-assets' and o.name = new.thumb_path)) then
      raise exception 'image_object_missing' using errcode = '23514';
    end if;
    new.published_path := null;          -- path publik hanya ditulis fungsi publish
    new.thumb_published_path := null;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.item_id::text));
  select count(*) into v_count from public.catalog_images where item_id = new.item_id;
  if v_count >= 7 then
    raise exception 'catalog_image_limit_reached' using errcode = '23514';
  end if;
  select min(g) into v_pos from generate_series(0, 6) g
   where not exists (select 1 from public.catalog_images i where i.item_id = new.item_id and i.position = g);
  new.position := v_pos;
  return new;
end;
$$;
revoke all on function public.catalog_images_guard() from public, anon, authenticated;

drop trigger if exists catalog_images_guard on public.catalog_images;
create trigger catalog_images_guard
  before insert on public.catalog_images
  for each row execute function public.catalog_images_guard();

-- Sampul otomatis: foto pertama menjadi sampul; bila sampul dihapus, foto pertama yang tersisa menggantikan.
create or replace function public.catalog_images_cover_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.catalog_items set cover_image_id = new.id
     where id = new.item_id and cover_image_id is null;
  else
    update public.catalog_items
       set cover_image_id = (select i.id from public.catalog_images i
                              where i.item_id = old.item_id and i.id <> old.id
                              order by i.position limit 1)
     where id = old.item_id and (cover_image_id is null or cover_image_id = old.id);
  end if;
  return null;
end;
$$;
revoke all on function public.catalog_images_cover_sync() from public, anon, authenticated;

drop trigger if exists catalog_images_cover_ins on public.catalog_images;
create trigger catalog_images_cover_ins
  after insert on public.catalog_images
  for each row execute function public.catalog_images_cover_sync();
drop trigger if exists catalog_images_cover_del on public.catalog_images;
create trigger catalog_images_cover_del
  after delete on public.catalog_images
  for each row execute function public.catalog_images_cover_sync();

------------------------------------------------------------------------------
-- 4. RPC
------------------------------------------------------------------------------
create or replace function public.reorder_catalog_items(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into v_page from public.pages where owner_id = v_uid for update;
  if v_page is null then raise exception 'page_not_found' using errcode = 'P0002'; end if;
  -- Daftar harus PERSIS himpunan item milik pemanggil (tanpa duplikat, tanpa id asing).
  if coalesce(array_length(p_ids, 1), 0) <> (select count(*) from public.catalog_items where page_id = v_page)
     or (select count(distinct x) from unnest(p_ids) x) <> coalesce(array_length(p_ids, 1), 0)
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.catalog_items ci where ci.id = x and ci.page_id = v_page)) then
    raise exception 'reorder_mismatch' using errcode = '22023';
  end if;
  update public.catalog_items ci set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where ci.id = o.id;
end;
$$;
revoke all on function public.reorder_catalog_items(uuid[]) from public, anon;
grant execute on function public.reorder_catalog_items(uuid[]) to authenticated;

create or replace function public.reorder_catalog_images(p_item uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.catalog_items ci join public.pages p on p.id = ci.page_id
                 where ci.id = p_item and p.owner_id = v_uid) then
    raise exception 'catalog_item_not_found' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_item::text));
  if coalesce(array_length(p_ids, 1), 0) <> (select count(*) from public.catalog_images where item_id = p_item)
     or (select count(distinct x) from unnest(p_ids) x) <> coalesce(array_length(p_ids, 1), 0)
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.catalog_images i where i.id = x and i.item_id = p_item)) then
    raise exception 'reorder_mismatch' using errcode = '22023';
  end if;
  set constraints public.catalog_images_item_position_key deferred;
  update public.catalog_images i set position = (o.ord - 1)::smallint
    from unnest(p_ids) with ordinality as o(id, ord)
   where i.id = o.id;
end;
$$;
revoke all on function public.reorder_catalog_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_catalog_images(uuid, uuid[]) to authenticated;

create or replace function public.set_catalog_cover(p_item uuid, p_image uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.catalog_items ci join public.pages p on p.id = ci.page_id
                 where ci.id = p_item and p.owner_id = v_uid) then
    raise exception 'catalog_item_not_found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.catalog_images i where i.id = p_image and i.item_id = p_item) then
    raise exception 'catalog_image_not_found' using errcode = '42501';
  end if;
  update public.catalog_items set cover_image_id = p_image where id = p_item;
end;
$$;
revoke all on function public.set_catalog_cover(uuid, uuid) from public, anon;
grant execute on function public.set_catalog_cover(uuid, uuid) to authenticated;

-- Pengaturan section di pages.draft_config.catalog = {enabled, title}; kunci lain (settings) tidak disentuh.
create or replace function public.set_catalog_settings(p_enabled boolean, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_enabled is null or char_length(v_title) < 1 or char_length(v_title) > 40
     or v_title ~ '[[:cntrl:]]' then
    raise exception 'catalog_title_invalid' using errcode = '22023';
  end if;
  update public.pages
     set draft_config = jsonb_set(coalesce(draft_config, '{}'::jsonb), '{catalog}',
                                  jsonb_build_object('enabled', p_enabled, 'title', v_title), true)
   where owner_id = auth.uid();
  if not found then raise exception 'page_not_found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.set_catalog_settings(boolean, text) from public, anon;
grant execute on function public.set_catalog_settings(boolean, text) to authenticated;

------------------------------------------------------------------------------
-- 5. Satu sumber payload katalog (draft = path draft; terbit = path publik). Bentuk IDENTIK.
------------------------------------------------------------------------------
create or replace function public.catalog_enabled(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Section aktif kecuali pemilik menonaktifkannya secara eksplisit (draft_config.catalog.enabled = false).
  select coalesce((select (p.draft_config #>> '{catalog,enabled}') is distinct from 'false'
                     from public.pages p where p.id = p_page_id), false)
$$;
revoke all on function public.catalog_enabled(uuid) from public, anon, authenticated;

create or replace function public.build_catalog_payload(p_page_id uuid, p_published boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ci.id, 'title', ci.title, 'summary', ci.summary, 'description', ci.description,
    'price_amount', ci.price_amount, 'price_label', ci.price_label,
    'cta_type', ci.cta_type, 'cta_label', ci.cta_label,
    'cta_value', ci.cta_value, 'cta_message', ci.cta_message,
    'cover', (select case when p_published then c.published_path else c.storage_path end
                from public.catalog_images c where c.id = ci.cover_image_id),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', case when p_published then i.published_path else i.storage_path end,
        'thumb', case when p_published then i.thumb_published_path else i.thumb_path end,
        'w', i.width, 'h', i.height) order by i.position)
      from public.catalog_images i where i.item_id = ci.id), '[]'::jsonb)
  ) order by ci.position), '[]'::jsonb)
  from public.catalog_items ci
  where ci.page_id = p_page_id and ci.is_visible and public.catalog_enabled(p_page_id)  -- section nonaktif: tidak ada katalog di snapshot
$$;
revoke all on function public.build_catalog_payload(uuid, boolean) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 6a. build_draft_payload (tanda tangan sama): bagian katalog kini lewat build_catalog_payload
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
    'catalog', public.build_catalog_payload(pg.id, false)
  )
  from public.profiles pr join public.pages pg on pg.owner_id = pr.id
  where pr.id = p_uid
$$;
revoke all on function public.build_draft_payload(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 6b. publish_page (tanda tangan sama; tetap tidak dapat dipanggil client sejak Phase 4)
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

  -- Semua gambar yang ikut terbit (termasuk thumbnail katalog) harus sudah punya salinan publik.
  if (v_profile.avatar_path is not null and v_profile.avatar_published_path is null)
     or (v_page.background_path is not null and v_page.background_published_path is null)
     or exists (select 1 from public.page_links l
                where l.page_id = v_page.id and l.is_visible
                  and l.image_path is not null and l.image_published_path is null)
     or exists (select 1 from public.catalog_images i
                join public.catalog_items ci on ci.id = i.item_id
                where ci.page_id = v_page.id and ci.is_visible and public.catalog_enabled(v_page.id)
                  and (i.published_path is null or (i.thumb_path is not null and i.thumb_published_path is null)))
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
    'catalog', public.build_catalog_payload(v_page.id, true)
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
revoke all on function public.publish_page() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 7. publish_page_with_assets: tanda tangan SAMA dengan Phase 4. Path publik katalog = path draft (nama acak,
--    immutable); aplikasi menyalin objek lebih dulu, fungsi ini memverifikasi dan menautkannya DALAM transaksi publish.
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
  v_img record;
  v_wanted text;
  v_version integer;
  v_pat text;
  v_cat text;
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

  -- Gambar link
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
  update public.page_links set image_published_path = null
   where page_id = v_page.id and is_visible and image_path is null and image_published_path is not null;

  if exists (select 1 from jsonb_object_keys(coalesce(p_links, '{}'::jsonb)) k
             where not exists (select 1 from public.page_links l
                               where l.id::text = k and l.page_id = v_page.id and l.is_visible and l.image_path is not null)) then
    raise exception 'assets_invalid' using errcode = '22023';
  end if;

  -- Katalog: path berasal dari baris database milik pemanggil (bukan dari client). Setiap foto (dan thumbnail)
  -- item yang tampil harus berpola milik pemanggil DAN sudah ada di public-assets; baru kemudian ditautkan.
  v_cat := '^' || v_uid::text || '/catalog/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$';
  for v_img in
    select i.id, i.storage_path, i.thumb_path
      from public.catalog_images i join public.catalog_items ci on ci.id = i.item_id
     where ci.page_id = v_page.id and ci.is_visible and public.catalog_enabled(v_page.id)
  loop
    if v_img.storage_path !~ v_cat
       or not exists (select 1 from storage.objects o where o.bucket_id = 'public-assets' and o.name = v_img.storage_path)
       or (v_img.thumb_path is not null and (v_img.thumb_path !~ v_cat
           or not exists (select 1 from storage.objects o where o.bucket_id = 'public-assets' and o.name = v_img.thumb_path)))
    then
      raise exception 'assets_not_published' using errcode = '23514';
    end if;
    update public.catalog_images
       set published_path = v_img.storage_path, thumb_published_path = v_img.thumb_path
     where id = v_img.id;
  end loop;

  v_version := public.publish_page();
  return v_version;
end;
$$;
revoke all on function public.publish_page_with_assets(text, text, jsonb) from public, anon;
grant execute on function public.publish_page_with_assets(text, text, jsonb) to authenticated;

------------------------------------------------------------------------------
-- 8. Grant kolom: client tidak dapat menulis posisi, sampul, atau path publik (revoke tingkat tabel lalu grant per kolom)
------------------------------------------------------------------------------
revoke insert, update on public.catalog_items from authenticated;
grant insert (page_id, title, summary, description, price_amount, price_label,
              cta_type, cta_label, cta_value, cta_message, is_visible)
  on public.catalog_items to authenticated;
grant update (title, summary, description, price_amount, price_label,
              cta_type, cta_label, cta_value, cta_message, is_visible)
  on public.catalog_items to authenticated;

revoke insert, update on public.catalog_images from authenticated;
grant insert (item_id, position, storage_path, thumb_path, width, height, size_bytes, mime)
  on public.catalog_images to authenticated;
