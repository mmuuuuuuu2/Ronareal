-- RONA — Phase 3: editor halaman, link manager.
-- IDEMPOTEN (aman dijalankan ulang) dan ADITIF: tidak mengubah migration 1–3, tidak menghapus data.
-- Isi:
--   1. Batasan skema URL tautan (hanya http/https/mailto/tel; menolak javascript:, data:, dll.)
--   2. Trigger page_links: batas jumlah link, posisi otomatis di akhir, path gambar harus milik pemilik
--   3. Trigger path gambar milik pemilik untuk profiles.avatar_path dan pages.background_path
--   4. reorder_links(uuid[]): urutan atomik, hanya milik pemanggil
--   5. change_username(text): ganti username dengan galat jelas (ditolak bila halaman sudah terbit)

------------------------------------------------------------------------------
-- 1. Skema URL
------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'page_links_url_scheme'
                 and conrelid = 'public.page_links'::regclass) then
    alter table public.page_links
      add constraint page_links_url_scheme
      check (url ~* '^(https?://[^[:space:]]+|mailto:[^[:space:]]+|tel:\+?[0-9()-]{3,30})$'
             and url !~ '[[:cntrl:]]');
  end if;
end $$;

------------------------------------------------------------------------------
-- 2. Trigger page_links
------------------------------------------------------------------------------
create or replace function public.page_links_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_max integer;
begin
  -- Path gambar harus berada di folder pemanggil dan berpola baku (bila dipanggil dari client).
  if v_uid is not null and new.image_path is not null then
    if new.image_path !~ ('^' || v_uid::text || '/link/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$') then
      raise exception 'image_path_invalid' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.page_id::text));
    select count(*), coalesce(max(position), -1) into v_count, v_max
      from public.page_links where page_id = new.page_id;
    if v_count >= 50 then
      raise exception 'link_limit_reached' using errcode = '23514';
    end if;
    new.position := v_max + 1;   -- selalu di akhir; urutan lain lewat reorder_links()
  end if;
  return new;
end;
$$;
revoke all on function public.page_links_guard() from public, anon, authenticated;

drop trigger if exists page_links_guard on public.page_links;
create trigger page_links_guard
  before insert or update of image_path on public.page_links
  for each row execute function public.page_links_guard();

------------------------------------------------------------------------------
-- 3. Path gambar milik pemilik: avatar dan latar
------------------------------------------------------------------------------
create or replace function public.owned_image_path_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path text;
  v_kind text := tg_argv[0];
begin
  if v_uid is null then return new; end if;
  if v_kind = 'avatar' then v_path := new.avatar_path; else v_path := new.background_path; end if;
  if v_path is not null
     and v_path !~ ('^' || v_uid::text || '/' || v_kind || '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$') then
    raise exception 'image_path_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.owned_image_path_guard() from public, anon, authenticated;

drop trigger if exists profiles_avatar_path_guard on public.profiles;
create trigger profiles_avatar_path_guard
  before insert or update of avatar_path on public.profiles
  for each row execute function public.owned_image_path_guard('avatar');

drop trigger if exists pages_background_path_guard on public.pages;
create trigger pages_background_path_guard
  before insert or update of background_path on public.pages
  for each row execute function public.owned_image_path_guard('background');

------------------------------------------------------------------------------
-- 4. reorder_links: atomik; daftar id harus PERSIS himpunan link milik pemanggil
------------------------------------------------------------------------------
create or replace function public.reorder_links(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page uuid;
  v_n integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select id into v_page from public.pages where owner_id = v_uid;
  if v_page is null then
    raise exception 'page_missing' using errcode = '23503';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_page::text));

  p_ids := coalesce(p_ids, '{}'::uuid[]);
  select count(*) into v_n from public.page_links where page_id = v_page;
  if cardinality(p_ids) <> v_n
     or (select count(distinct x) from unnest(p_ids) x) <> v_n
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.page_links l where l.id = x and l.page_id = v_page)) then
    raise exception 'reorder_mismatch' using errcode = '23514';
  end if;

  update public.page_links l
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where l.id = o.id and l.page_id = v_page;
end;
$$;
revoke all on function public.reorder_links(uuid[]) from public, anon;
grant execute on function public.reorder_links(uuid[]) to authenticated;

------------------------------------------------------------------------------
-- 5. change_username
------------------------------------------------------------------------------
create or replace function public.change_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_current text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select username into v_current from public.profiles where id = v_uid;
  if v_current is null then
    raise exception 'profile_missing' using errcode = '23503';
  end if;
  if v_name !~ '^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$' then
    raise exception 'username_invalid' using errcode = '23514';
  end if;
  if v_name = v_current then
    return v_current;  -- tidak ada perubahan
  end if;
  if exists (select 1 from public.pages where owner_id = v_uid and is_published) then
    raise exception 'username_locked_published' using errcode = '23514';
  end if;
  begin
    -- Trigger profiles_username_rules menolak username reserved.
    update public.profiles set username = v_name where id = v_uid;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
  return v_name;
end;
$$;
revoke all on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;
