-- RONA — Phase 8: perbaikan integrasi & hardening (additive + idempotent; tidak mengubah migration lama, tidak menghapus data).
--
-- Temuan audit lintas fase:
--   1. DEADLOCK (kritis untuk keandalan): publish_page_with_assets() mengunci `pages` lalu menulis `profiles`
--      (avatar_published_path), sedangkan save_draft() (Phase 6) mengunci `profiles` lalu `pages` — urutan terbalik.
--      Simpan draft yang bersamaan dengan Terbitkan dapat saling menunggu -> galat 40P01 (terbukti oleh tes paralel
--      supabase/tests/phase8_lock_*.sql sebelum perbaikan). Perbaikan: save_draft() memakai urutan yang sama (pages -> profiles).
--   2. Hak tabel berlebih: role anon/authenticated memegang TRUNCATE/REFERENCES/TRIGGER (bawaan platform). TRUNCATE tidak
--      tunduk pada RLS. Dicabut.
--   3. Client tidak perlu INSERT/DELETE langsung pada `pages` dan `profiles` (dibuat oleh claim_profile() SECURITY DEFINER).
--      Dengan hak itu pemilik dapat menghapus halamannya lewat API (merusak akun) atau membuat baris `pages` dengan
--      is_published/published_snapshot_id sembarang. Dicabut. UPDATE kolom tetap sama (kolom terbatas).
--   4. is_username_available() dapat dipanggil anon: siapa pun bisa menebak username akun yang belum terbit. Dicabut dari anon
--      (aplikasi hanya memakainya untuk pengguna masuk).

-- 1. save_draft: tanda tangan & perilaku sama dengan Phase 6; hanya urutan kunci diubah (pages dulu, lalu profiles)
create or replace function public.save_draft(
  p_profile jsonb,
  p_settings jsonb,
  p_profile_rev integer,
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

  -- URUTAN KUNCI TETAP: pages lalu profiles (sama dengan publish_page_with_assets) agar tidak ada deadlock.
  select settings_rev into v_page_rev from public.pages where owner_id = v_uid for update;
  if not found then raise exception 'page_not_found' using errcode = 'P0002'; end if;
  select profile_rev into v_prof_rev from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing' using errcode = '23503'; end if;

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

-- 2. Hak tabel yang tidak dipakai client
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 3. pages/profiles dibuat hanya oleh claim_profile() (SECURITY DEFINER); client tidak menyisipkan/menghapus langsung
revoke insert, delete on public.pages from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- 4. Tidak ada enumerasi username oleh anon
revoke execute on function public.is_username_available(text) from anon;
