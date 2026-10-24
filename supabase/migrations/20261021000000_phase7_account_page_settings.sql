-- RONA — Phase 7: akun, username, dan pengaturan halaman (additive + idempotent; tidak mengubah migration lama).
--
-- Temuan audit terhadap Phase 0–6:
--   * change_username() (Phase 3) MENOLAK perubahan selama halaman terbit (`username_locked_published`). Phase 7 mewajibkan
--     username bisa diganti walau terbit. Penyebab penguncian: snapshot menanam `profile.username`, sedangkan get_public_page()
--     mencari berdasarkan profiles.username SAAT INI. Tanpa perbaikan, URL baru menampilkan snapshot dengan @handle lama.
--   * Username lama yang dilepas bisa langsung diambil orang lain (risiko meniru/menyerobot URL lama).
--   * Perubahan username tidak menaikkan profile_rev, sehingga tab editor yang basi bisa DIAM-DIAM mengembalikan username lama.
--   * SEO/metadata belum punya penyimpanan.
--
-- Perubahan:
--   1. username_released: karantina 30 hari. Username yang dilepas hanya boleh diambil kembali oleh pemilik sebelumnya.
--      Diberlakukan di trigger profiles_username_rules (satu tempat; berlaku untuk claim_profile, change_username, save_draft).
--   2. is_username_available(): ikut memperhitungkan karantina.
--   3. change_username(): boleh saat terbit; mengunci baris profil; menaikkan profile_rev; galat tetap sama + username_recently_released.
--   4. get_public_page(): username pada snapshot SELALU ditimpa username profil saat ini (kunci URL). Tidak membaca draft.
--   5. get_publish_state(): perbandingan "ada perubahan belum terbit" mengabaikan perbedaan username (username berlaku langsung).
--   6. pages.seo_rev + save_seo(): SEO disimpan di draft_config.seo (ikut snapshot saat Publish), revisi terpisah dari tampilan.
--   7. update_profile_fields(): ubah nama tampilan / bio secara PARSIAL dengan pemeriksaan profile_rev.
-- Tidak ada tabel yang dihapus/di-rename. Tidak menyentuh published_snapshots.

------------------------------------------------------------------------------
-- 1. Karantina username
------------------------------------------------------------------------------
create table if not exists public.username_released (
  username    text primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  released_at timestamptz not null default now(),
  constraint username_released_format check (username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$')
);
alter table public.username_released enable row level security;  -- tanpa policy: tidak terbaca oleh client sama sekali
revoke all on public.username_released from anon, authenticated;

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
  -- Karantina: nama yang baru dilepas pemilik LAIN tidak boleh diambil selama 30 hari.
  if exists (select 1 from public.username_released q
             where q.username = new.username and q.owner_id is distinct from new.id
               and q.released_at > now() - interval '30 days') then
    raise exception 'username_recently_released' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.username is distinct from new.username then
    insert into public.username_released (username, owner_id, released_at)
    values (old.username, old.id, now())
    on conflict (username) do update set owner_id = excluded.owner_id, released_at = excluded.released_at;
    delete from public.username_released where username = new.username and owner_id = new.id;  -- mengambil kembali namanya sendiri
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_username_rules() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. is_username_available: tanda tangan sama; hanya kenyamanan (database tetap otoritas)
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
    and not exists (select 1 from public.username_released q
                    where q.username = lower(btrim(p_username))
                      and q.owner_id is distinct from auth.uid()
                      and q.released_at > now() - interval '30 days')
$$;

------------------------------------------------------------------------------
-- 3. change_username: tanda tangan sama. Boleh saat terbit; profile_rev naik agar tab editor basi terdeteksi konflik.
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
  select username into v_current from public.profiles where id = v_uid for update;
  if v_current is null then
    raise exception 'profile_missing' using errcode = '23503';
  end if;
  if v_name !~ '^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$' then
    raise exception 'username_invalid' using errcode = '23514';
  end if;
  if v_name = v_current then
    return v_current;  -- tidak ada perubahan
  end if;
  begin
    -- Trigger profiles_username_rules menolak username reserved / dalam karantina. Unique constraint
    -- (profiles_username_key) adalah penjaga balapan: dua pengguna yang berebut nama yang sama -> satu unique_violation.
    update public.profiles set username = v_name, profile_rev = profile_rev + 1 where id = v_uid;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
  return v_name;
end;
$$;
revoke all on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;

------------------------------------------------------------------------------
-- 4. get_public_page: username kunci URL ditimpa dengan nilai profil SAAT INI (hanya dari snapshot + username)
------------------------------------------------------------------------------
create or replace function public.get_public_page(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_set(s.payload, '{profile,username}', to_jsonb(pr.username), true)
         || jsonb_build_object('version', s.version, 'published_at', s.created_at)
  from public.profiles pr
  join public.pages pg on pg.owner_id = pr.id
  join public.published_snapshots s on s.id = pg.published_snapshot_id
  where pr.username = lower(p_username)
    and pg.is_published
$$;
revoke all on function public.get_public_page(text) from public;
grant execute on function public.get_public_page(text) to anon, authenticated;

------------------------------------------------------------------------------
-- 5. get_publish_state: username tidak dihitung sebagai "perubahan belum terbit"
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
  v_username text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_page from public.pages where owner_id = v_uid;
  if not found then
    raise exception 'page_not_found' using errcode = 'P0002';
  end if;
  select username into v_username from public.profiles where id = v_uid;
  if v_page.published_snapshot_id is not null then
    select * into v_snap from public.published_snapshots where id = v_page.published_snapshot_id;
  end if;
  return jsonb_build_object(
    'is_published', v_page.is_published,
    'version', v_snap.version,                 -- versi terakhir yang pernah terbit (null bila belum pernah)
    'published_at', v_snap.created_at,
    'has_changes', v_snap.id is null
                   or public.build_draft_payload(v_uid)
                      is distinct from jsonb_set(v_snap.payload, '{profile,username}', to_jsonb(v_username), true)
  );
end;
$$;
revoke all on function public.get_publish_state() from public, anon;
grant execute on function public.get_publish_state() to authenticated;

------------------------------------------------------------------------------
-- 6. SEO & berbagi sosial: pages.draft_config.seo (ikut snapshot saat Publish)
------------------------------------------------------------------------------
alter table public.pages add column if not exists seo_rev integer not null default 0;

create or replace function public.save_seo(p_seo jsonb, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rev integer;
  v_seo jsonb;
  v_title text;
  v_desc text;
  v_og_title text;
  v_og_desc text;
  v_og_image text;
  v_card text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_seo is null or jsonb_typeof(p_seo) <> 'object' then raise exception 'seo_invalid' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(p_seo) k
             where k not in ('title', 'description', 'ogTitle', 'ogDescription', 'ogImage', 'twitterCard')) then
    raise exception 'seo_invalid' using errcode = '22023';
  end if;

  v_title    := nullif(btrim(coalesce(p_seo ->> 'title', '')), '');
  v_desc     := nullif(btrim(coalesce(p_seo ->> 'description', '')), '');
  v_og_title := nullif(btrim(coalesce(p_seo ->> 'ogTitle', '')), '');
  v_og_desc  := nullif(btrim(coalesce(p_seo ->> 'ogDescription', '')), '');
  v_og_image := coalesce(nullif(btrim(coalesce(p_seo ->> 'ogImage', '')), ''), 'avatar');
  v_card     := coalesce(nullif(btrim(coalesce(p_seo ->> 'twitterCard', '')), ''), 'summary');

  if char_length(coalesce(v_title, '')) > 70 or char_length(coalesce(v_og_title, '')) > 70
     or char_length(coalesce(v_desc, '')) > 160 or char_length(coalesce(v_og_desc, '')) > 200 then
    raise exception 'seo_invalid' using errcode = '22023';
  end if;
  if coalesce(v_title, '') ~ '[[:cntrl:]]' or coalesce(v_desc, '') ~ '[[:cntrl:]]'
     or coalesce(v_og_title, '') ~ '[[:cntrl:]]' or coalesce(v_og_desc, '') ~ '[[:cntrl:]]' then
    raise exception 'seo_invalid' using errcode = '22023';
  end if;
  if v_og_image not in ('avatar', 'background', 'none') or v_card not in ('summary', 'summary_large_image') then
    raise exception 'seo_invalid' using errcode = '22023';
  end if;

  select seo_rev into v_rev from public.pages where owner_id = v_uid for update;
  if not found then raise exception 'page_not_found' using errcode = 'P0002'; end if;
  if p_rev is distinct from v_rev then raise exception 'draft_conflict_seo' using errcode = '40001'; end if;

  v_seo := jsonb_strip_nulls(jsonb_build_object(
    'title', v_title, 'description', v_desc, 'ogTitle', v_og_title, 'ogDescription', v_og_desc,
    'ogImage', v_og_image, 'twitterCard', v_card));

  -- Hanya kunci `seo` yang disentuh; `settings`, `catalog`, dan kunci lain dibawa apa adanya oleh database.
  update public.pages
     set draft_config = jsonb_set(coalesce(draft_config, '{}'::jsonb), '{seo}', v_seo, true),
         seo_rev = seo_rev + 1
   where owner_id = v_uid
  returning seo_rev into v_rev;

  return jsonb_build_object('seo_rev', v_rev, 'seo', v_seo);
end;
$$;
revoke all on function public.save_seo(jsonb, integer) from public, anon;
grant execute on function public.save_seo(jsonb, integer) to authenticated;

------------------------------------------------------------------------------
-- 7. update_profile_fields: nama tampilan / bio parsial, dengan pemeriksaan profile_rev
------------------------------------------------------------------------------
create or replace function public.update_profile_fields(p_patch jsonb, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rev integer;
  v_name text;
  v_bio text;
  v_has_name boolean;
  v_has_bio boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'draft_invalid' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('displayName', 'bio')) then
    raise exception 'draft_invalid' using errcode = '22023';
  end if;
  v_has_name := p_patch ? 'displayName';
  v_has_bio := p_patch ? 'bio';
  if not v_has_name and not v_has_bio then raise exception 'draft_nothing_to_save' using errcode = '22023'; end if;

  select profile_rev into v_rev from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing' using errcode = '23503'; end if;
  if p_rev is distinct from v_rev then raise exception 'draft_conflict_profile' using errcode = '40001'; end if;

  if v_has_name then
    v_name := btrim(coalesce(p_patch ->> 'displayName', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 80 or v_name ~ '[[:cntrl:]]' then
      raise exception 'draft_invalid' using errcode = '22023';
    end if;
  end if;
  if v_has_bio then
    v_bio := nullif(btrim(coalesce(p_patch ->> 'bio', '')), '');
    if v_bio is not null and char_length(v_bio) > 500 then raise exception 'draft_invalid' using errcode = '22023'; end if;
  end if;

  update public.profiles
     set display_name = case when v_has_name then v_name else display_name end,
         bio = case when v_has_bio then v_bio else bio end,
         profile_rev = profile_rev + 1
   where id = v_uid
  returning profile_rev, display_name, bio into v_rev, v_name, v_bio;

  return jsonb_build_object('profile_rev', v_rev, 'display_name', v_name, 'bio', v_bio);
end;
$$;
revoke all on function public.update_profile_fields(jsonb, integer) from public, anon;
grant execute on function public.update_profile_fields(jsonb, integer) to authenticated;
