-- RONA — Phase 0 foundation
-- Semua tabel di schema public diekspos lewat API Supabase, jadi RLS WAJIB aktif di semuanya.
-- Prinsip: draft privat (tabel + bucket privat) terpisah dari konten publik
-- (published_snapshots dibaca hanya lewat get_public_page(), bucket public-assets).

------------------------------------------------------------------------------
-- 0. Utilitas
------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 1. Username reserved
------------------------------------------------------------------------------
create table public.reserved_usernames (
  name text primary key check (name = lower(name))
);
alter table public.reserved_usernames enable row level security;
-- Sengaja TANPA policy: tidak ada role API yang bisa membaca/menulis. Hanya fungsi
-- security definer di bawah dan migration yang menyentuhnya.

insert into public.reserved_usernames (name) values
  ('login'), ('register'), ('signup'), ('sign-up'), ('signin'), ('sign-in'), ('logout'),
  ('auth'), ('callback'), ('dashboard'), ('editor'), ('preview'), ('settings'), ('account'),
  ('profile'), ('api'), ('admin'), ('administrator'), ('root'), ('support'), ('help'),
  ('about'), ('terms'), ('privacy'), ('pricing'), ('contact'), ('blog'), ('docs'),
  ('static'), ('assets'), ('public'), ('_next'), ('favicon'), ('icons'), ('robots'),
  ('sitemap'), ('manifest'), ('services'), ('catalog'), ('rona'), ('www'), ('app'),
  ('null'), ('undefined'), ('me'), ('new'), ('explore'), ('search'), ('u'), ('p');

------------------------------------------------------------------------------
-- 2. Profiles
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  bio text,
  avatar_path text,            -- path di bucket draft-assets (privat)
  avatar_published_path text,  -- path di bucket public-assets, diisi server saat publish
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_key unique (username),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 80),
  constraint profiles_bio_len check (char_length(bio) <= 500)
);
alter table public.profiles enable row level security;

create or replace function public.enforce_username_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reserved_usernames r where r.name = new.username) then
    raise exception 'username_reserved' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_username_rules() from public, anon, authenticated;

create trigger profiles_username_rules
  before insert or update of username on public.profiles
  for each row execute function public.enforce_username_rules();
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profil boleh dibaca/ditulis HANYA oleh pemiliknya. Pembacaan publik lewat get_public_page().
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Tidak ada policy DELETE: penghapusan akun lewat auth (cascade), bukan dari client.

------------------------------------------------------------------------------
-- 3. Pages (satu halaman per pengguna di MVP)
------------------------------------------------------------------------------
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  draft_config jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  published_snapshot_id uuid,  -- FK ditambahkan setelah published_snapshots dibuat
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_draft_config_object check (jsonb_typeof(draft_config) = 'object'),
  constraint pages_draft_config_size check (octet_length(draft_config::text) <= 200000)
);
alter table public.pages enable row level security;
create trigger pages_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- owner_id selalu dipaksa dari auth.uid() lewat policy, bukan dari nilai yang dikirim browser.
create policy pages_select_own on public.pages
  for select to authenticated using (owner_id = (select auth.uid()));
create policy pages_insert_own on public.pages
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy pages_update_own on public.pages
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy pages_delete_own on public.pages
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Kolom status publikasi hanya boleh diubah oleh publish_page()/unpublish_page().
-- Revoke harus di tingkat tabel (revoke tingkat kolom tidak berefek bila grant tabel ada),
-- lalu grant ulang hanya kolom yang memang boleh diedit client.
revoke update on public.pages from authenticated;
grant update (draft_config) on public.pages to authenticated;

------------------------------------------------------------------------------
-- 4. Published snapshots (immutable)
------------------------------------------------------------------------------
create table public.published_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  version integer not null check (version > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint published_snapshots_version_key unique (page_id, version)
);
alter table public.published_snapshots enable row level security;

alter table public.pages
  add constraint pages_published_snapshot_fk
  foreign key (published_snapshot_id) references public.published_snapshots (id) on delete set null;

-- Pemilik hanya boleh MEMBACA riwayat versinya. Tulis hanya lewat publish_page().
create policy snapshots_select_own on public.published_snapshots
  for select to authenticated
  using (exists (select 1 from public.pages p
                 where p.id = page_id and p.owner_id = (select auth.uid())));

------------------------------------------------------------------------------
-- 5. Page links
------------------------------------------------------------------------------
create table public.page_links (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 300),
  url text not null check (char_length(url) <= 2048),
  aspect_ratio text not null default '3:4' check (aspect_ratio in ('1:1', '3:4', '16:9')),
  bg_color text check (bg_color ~ '^#[0-9a-fA-F]{6}$'),
  image_path text,
  image_published_path text,
  config jsonb not null default '{}'::jsonb,  -- alignment, posisi vertikal, overlay, crop, radius, spacing, dst.
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_links_config_object check (jsonb_typeof(config) = 'object'),
  constraint page_links_config_size check (octet_length(config::text) <= 20000)
);
create index page_links_page_position_idx on public.page_links (page_id, position);
alter table public.page_links enable row level security;
create trigger page_links_updated_at
  before update on public.page_links
  for each row execute function public.set_updated_at();

create policy page_links_all_own on public.page_links
  for all to authenticated
  using (exists (select 1 from public.pages p
                 where p.id = page_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pages p
                      where p.id = page_id and p.owner_id = (select auth.uid())));

------------------------------------------------------------------------------
-- 6. Katalog
------------------------------------------------------------------------------
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  cta_type text check (cta_type in ('whatsapp', 'url', 'email', 'phone')),
  -- NULL = "belum dikustomisasi": default diterapkan saat render, tidak pernah ditulis
  -- menimpa nilai yang sengaja diisi pengguna.
  cta_label text check (char_length(cta_label) <= 60),
  cta_value text check (char_length(cta_value) <= 2048),
  cta_message text check (char_length(cta_message) <= 1000),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalog_items_page_position_idx on public.catalog_items (page_id, position);
alter table public.catalog_items enable row level security;
create trigger catalog_items_updated_at
  before update on public.catalog_items
  for each row execute function public.set_updated_at();

create policy catalog_items_all_own on public.catalog_items
  for all to authenticated
  using (exists (select 1 from public.pages p
                 where p.id = page_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pages p
                      where p.id = page_id and p.owner_id = (select auth.uid())));

create table public.catalog_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalog_items (id) on delete cascade,
  -- Maksimal 7 gambar per item dipaksa di database: posisi 0..6 dan unik per item.
  position smallint not null check (position between 0 and 6),
  storage_path text not null,
  published_path text,
  created_at timestamptz not null default now(),
  constraint catalog_images_item_position_key unique (item_id, position)
);
alter table public.catalog_images enable row level security;

create policy catalog_images_all_own on public.catalog_images
  for all to authenticated
  using (exists (select 1 from public.catalog_items ci
                 join public.pages p on p.id = ci.page_id
                 where ci.id = item_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.catalog_items ci
                      join public.pages p on p.id = ci.page_id
                      where ci.id = item_id and p.owner_id = (select auth.uid())));

------------------------------------------------------------------------------
-- 7. Publish / unpublish / baca publik
------------------------------------------------------------------------------
-- publish_page(): satu transaksi. Jika ada error di mana pun, seluruhnya di-rollback,
-- sehingga snapshot live sebelumnya tidak berubah. Identitas diambil dari auth.uid(),
-- tidak menerima owner_id dari client.
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

  -- Validasi: semua gambar yang ikut terbit harus sudah punya salinan publik.
  if exists (select 1 from public.page_links l
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

create or replace function public.unpublish_page()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.pages set is_published = false where owner_id = auth.uid();
end;
$$;

-- Satu-satunya jalur baca publik. Hanya mengembalikan snapshot yang sedang live,
-- tidak pernah draft. Server Next.js membungkusnya dengan cache bertag per username.
create or replace function public.get_public_page(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.payload
  from public.profiles pr
  join public.pages pg on pg.owner_id = pr.id
  join public.published_snapshots s on s.id = pg.published_snapshot_id
  where pr.username = lower(p_username)
    and pg.is_published
$$;

revoke all on function public.publish_page() from public, anon;
revoke all on function public.unpublish_page() from public, anon;
revoke all on function public.get_public_page(text) from public;
grant execute on function public.publish_page() to authenticated;
grant execute on function public.unpublish_page() to authenticated;
grant execute on function public.get_public_page(text) to anon, authenticated;

------------------------------------------------------------------------------
-- 8. Hak akses tabel: anon tidak punya akses langsung ke tabel apa pun
------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on public.reserved_usernames from authenticated;
revoke insert, update, delete on public.published_snapshots from authenticated;

------------------------------------------------------------------------------
-- 9. Storage
------------------------------------------------------------------------------
-- Konvensi path objek: <auth.uid()>/<nama-file>. Folder pertama = pemilik.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('draft-assets',  'draft-assets',  false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('public-assets', 'public-assets', true,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy draft_assets_owner_all on storage.objects
  for all to authenticated
  using (bucket_id = 'draft-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'draft-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- public-assets: bucket publik (URL langsung bisa dibaca siapa pun), tetapi hanya pemilik
-- yang boleh menulis ke foldernya sendiri.
create policy public_assets_owner_write on storage.objects
  for all to authenticated
  using (bucket_id = 'public-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'public-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
