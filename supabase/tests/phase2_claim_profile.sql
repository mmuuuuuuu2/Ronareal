-- RONA — tes Phase 2: claim_profile() atomik dan username reserved tambahan.
-- Jalankan setelah SEMUA migration (lihat scripts/test-db.sh). Transaksi + ROLLBACK.

begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.expect_fail(p_sql text, p_label text, p_msg_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_msg_like is not null and sqlerrm not like p_msg_like then
      raise exception 'FAIL: % — ditolak dengan pesan tak terduga: %', p_label, sqlerrm;
    end if;
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — seharusnya ditolak', p_label;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000c1';
  b uuid := '00000000-0000-0000-0000-0000000000d1';
  c uuid := '00000000-0000-0000-0000-0000000000e1';
  pid uuid;
  n bigint;
  dn text;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'c1@example.test'),
    (b, 'authenticated', 'authenticated', 'd1@example.test'),
    (c, 'authenticated', 'authenticated', 'e1@example.test');

  -- Jalur bahagia
  perform pg_temp.as_user(a);
  pid := public.claim_profile('  Nadia-Rahma ', '  Nadia Rahma  ');
  select display_name into dn from public.profiles where id = a and username = 'nadia-rahma';
  if dn is distinct from 'Nadia Rahma' then raise exception 'FAIL: profil/display name tidak tersimpan atau tidak dirapikan (%)', dn; end if;
  select count(*) into n from public.pages where owner_id = a and id = pid;
  if n <> 1 then raise exception 'FAIL: page tidak dibuat'; end if;
  raise notice 'PASS: claim_profile menyimpan username ternormalisasi + display name + page dalam satu langkah';

  perform pg_temp.expect_fail($q$select public.claim_profile('lain-lagi', 'X')$q$,
    'klaim kedua oleh pengguna yang sama ditolak', '%profile_exists%');

  -- Penolakan oleh pengguna lain, tanpa meninggalkan profil setengah jadi
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select public.claim_profile('nadia-rahma', 'Bobi')$q$, 'username terpakai ditolak', '%username_taken%');
  perform pg_temp.expect_fail($q$select public.claim_profile('onboarding', 'Bobi')$q$, 'username "onboarding" reserved', '%username_reserved%');
  perform pg_temp.expect_fail($q$select public.claim_profile('dashboard', 'Bobi')$q$, 'username "dashboard" reserved', '%username_reserved%');
  perform pg_temp.expect_fail($q$select public.claim_profile('ab', 'Bobi')$q$, 'username terlalu pendek', '%username_invalid%');
  perform pg_temp.expect_fail($q$select public.claim_profile('Bad Name', 'Bobi')$q$, 'username berspasi', '%username_invalid%');
  perform pg_temp.expect_fail($q$select public.claim_profile('bobi-ok', '   ')$q$, 'display name kosong', '%display_name_invalid%');
  perform pg_temp.expect_fail(format($q$select public.claim_profile('bobi-ok', %L)$q$, repeat('x', 81)), 'display name 81 karakter', '%display_name_invalid%');
  perform pg_temp.expect_fail(format($q$select public.claim_profile('bobi-ok', %L)$q$, 'Bo' || chr(7) || 'bi'), 'display name berisi karakter kontrol', '%display_name_invalid%');
  select count(*) into n from public.profiles where id = b;
  if n <> 0 then raise exception 'FAIL: klaim gagal tetapi profil B terbentuk'; end if;
  select count(*) into n from public.pages where owner_id = b;
  if n <> 0 then raise exception 'FAIL: klaim gagal tetapi page B terbentuk'; end if;
  raise notice 'PASS: semua klaim gagal tidak meninggalkan profil/page setengah jadi';

  -- Batas panjang tepat 80 diterima
  perform pg_temp.as_user(c);
  perform public.claim_profile('batas-80', repeat('y', 80));
  raise notice 'PASS: display name 80 karakter diterima';

  -- Anon
  perform pg_temp.as_anon();
  perform pg_temp.expect_fail($q$select public.claim_profile('anon-nama', 'Anon')$q$, 'anon tidak bisa claim_profile');
  perform pg_temp.expect_fail($q$select public.is_username_available('onboarding')$q$, 'anon tidak bisa memanggil is_username_available (Phase 8)');
  perform pg_temp.as_user(a);
  if public.is_username_available('onboarding') then raise exception 'FAIL: "onboarding" dilaporkan tersedia'; end if;
  if public.is_username_available('nadia-rahma') then raise exception 'FAIL: username terpakai dilaporkan tersedia'; end if;
  raise notice 'PASS: is_username_available menolak reserved baru dan yang terpakai';

  -- Pemilik hanya bisa mengubah profil sendiri (policy RLS dipakai fitur edit profil nanti)
  perform pg_temp.as_user(b);
  update public.profiles set display_name = 'Hacked' where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B bisa mengubah profil A'; end if;
  raise notice 'PASS: pengguna lain tidak bisa mengubah profil A';

  raise notice 'SEMUA TES PHASE 2 LULUS';
end $$;

rollback;
