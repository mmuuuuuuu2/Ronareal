-- RONA — Phase 2: onboarding atomik (username + nama tampilan) dan tambahan username reserved.
-- Non-destruktif: hanya INSERT ... ON CONFLICT DO NOTHING dan fungsi baru. Migration 1 dan 2 TIDAK diubah,
-- sehingga aman diterapkan ke proyek yang sudah menjalankan keduanya.

------------------------------------------------------------------------------
-- 1. Username reserved tambahan (rute aplikasi Phase 2 dan rute yang hampir pasti dipakai kemudian)
--    Temuan audit: 'onboarding' dipakai sebagai rute /onboarding tetapi belum reserved.
------------------------------------------------------------------------------
insert into public.reserved_usernames (name) values
  ('onboarding'), ('welcome'), ('verify'), ('confirm'), ('forgot-password'), ('reset-password'),
  ('update-password'), ('error'), ('not-found'), ('loading'), ('offline'), ('health'), ('status'),
  ('manifest'), ('security'), ('legal'), ('cookies'), ('careers'), ('press'), ('changelog')
on conflict (name) do nothing;

------------------------------------------------------------------------------
-- 2. claim_profile(): klaim username + simpan nama tampilan + buat page, dalam SATU transaksi.
--    claim_username() dari migration 2 tetap ada (kompatibilitas), tetapi aplikasi memakai fungsi ini.
------------------------------------------------------------------------------
create or replace function public.claim_profile(p_username text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_display text := btrim(coalesce(p_display_name, ''));
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
  if char_length(v_display) not between 1 and 80 or v_display ~ '[[:cntrl:]]' then
    raise exception 'display_name_invalid' using errcode = '23514';
  end if;

  begin
    -- Trigger profiles_username_rules menolak username reserved ('username_reserved').
    insert into public.profiles (id, username, display_name) values (v_uid, v_name, v_display);
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;

  insert into public.pages (owner_id) values (v_uid) returning id into v_page_id;
  return v_page_id;
end;
$$;

revoke all on function public.claim_profile(text, text) from public, anon;
grant execute on function public.claim_profile(text, text) to authenticated;
