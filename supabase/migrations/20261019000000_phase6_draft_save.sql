-- RONA — Phase 6: penyimpanan draft yang aman terhadap edit bersamaan (additive + idempotent).
-- Masalah Phase 5: saveDraftAction membaca pages.draft_config lalu menulis SELURUH objek kembali (baca-ubah-tulis di sisi
-- aplikasi). Bila konfigurasi katalog berubah di antara baca dan tulis, perubahan itu hilang diam-diam; dua tab juga saling menimpa.
--
-- Perbaikan:
--   1. pages.settings_rev dan profiles.profile_rev: penghitung revisi per GRUP data (tampilan / profil). Hanya RPC yang
--      mengubahnya (tidak ada grant kolom untuk client).
--   2. save_draft(): SATU transaksi atomik. Menulis hanya grup yang dikirim, memeriksa revisi (optimistic concurrency),
--      dan untuk tampilan memakai merge jsonb PARSIAL (kunci lain seperti `catalog` tidak pernah disentuh/dibaca ulang oleh aplikasi).
--      Revisi tak cocok => galat `draft_conflict_*` dan TIDAK ADA yang tertulis.
--   3. Tidak menyentuh published snapshot (publish tetap milik Phase 4).

alter table public.pages    add column if not exists settings_rev integer not null default 0;
alter table public.profiles add column if not exists profile_rev  integer not null default 0;

create or replace function public.save_draft(
  p_profile jsonb,        -- null = jangan ubah profil; {displayName, bio, username}
  p_settings jsonb,       -- null = jangan ubah tampilan; objek pengaturan (sudah disanitasi aplikasi)
  p_profile_rev integer,  -- revisi profil yang dilihat editor saat memuat/terakhir menyimpan
  p_settings_rev integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prof_rev integer;
  v_page_rev integer;
  v_username text;
  v_name text;
  v_bio text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_profile is null and p_settings is null then
    raise exception 'draft_nothing_to_save' using errcode = '22023';
  end if;

  -- Kunci baris milik pemanggil (urutan tetap: profiles lalu pages) agar dua simpan bersamaan berurutan, bukan saling menimpa.
  select profile_rev into v_prof_rev from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing' using errcode = '23503'; end if;
  select settings_rev into v_page_rev from public.pages where owner_id = v_uid for update;
  if not found then raise exception 'page_not_found' using errcode = 'P0002'; end if;

  if p_profile is not null then
    if jsonb_typeof(p_profile) <> 'object' then raise exception 'draft_invalid' using errcode = '22023'; end if;
    if p_profile_rev is distinct from v_prof_rev then
      raise exception 'draft_conflict_profile' using errcode = '40001';
    end if;
    v_name := btrim(coalesce(p_profile ->> 'displayName', ''));
    v_bio  := nullif(btrim(coalesce(p_profile ->> 'bio', '')), '');
    if char_length(v_name) < 1 or char_length(v_name) > 80 or v_name ~ '[[:cntrl:]]' then
      raise exception 'draft_invalid' using errcode = '22023';
    end if;
    if v_bio is not null and char_length(v_bio) > 500 then
      raise exception 'draft_invalid' using errcode = '22023';
    end if;
    -- change_username memakai aturan Phase 3 (format, reserved, unik, terkunci saat terbit); galatnya membatalkan SELURUH transaksi.
    v_username := public.change_username(p_profile ->> 'username');
    update public.profiles
       set display_name = v_name, bio = v_bio, profile_rev = profile_rev + 1
     where id = v_uid
    returning profile_rev into v_prof_rev;
  else
    select username into v_username from public.profiles where id = v_uid;
  end if;

  if p_settings is not null then
    if jsonb_typeof(p_settings) <> 'object' then raise exception 'draft_invalid' using errcode = '22023'; end if;
    if p_settings_rev is distinct from v_page_rev then
      raise exception 'draft_conflict_settings' using errcode = '40001';
    end if;
    -- Merge PARSIAL: hanya `version` dan `settings`. Kunci lain (mis. `catalog`) dibawa apa adanya oleh database.
    update public.pages
       set draft_config = coalesce(draft_config, '{}'::jsonb)
                          || jsonb_build_object('version', 1, 'settings', p_settings),
           settings_rev = settings_rev + 1
     where owner_id = v_uid
    returning settings_rev into v_page_rev;
  end if;

  return jsonb_build_object('username', v_username, 'profile_rev', v_prof_rev, 'settings_rev', v_page_rev);
end;
$$;
revoke all on function public.save_draft(jsonb, jsonb, integer, integer) from public, anon;
grant execute on function public.save_draft(jsonb, jsonb, integer, integer) to authenticated;
