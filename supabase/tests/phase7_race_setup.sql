-- Data PERMANEN (commit) untuk tes balapan username; dijalankan oleh scripts/test-db.sh pada DB sementara.
-- 25 pasang akun (ra-N dan rb-N); tiap pasang kelak berebut nama "rebut-N" dari dua sesi paralel.
do $$
declare i int; ua uuid; ub uuid;
begin
  for i in 1..25 loop
    ua := ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid;
    ub := ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, aud, role, email) values
      (ua, 'authenticated', 'authenticated', 'ra' || i || '@example.test'),
      (ub, 'authenticated', 'authenticated', 'rb' || i || '@example.test');
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', ua::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.claim_profile('ra-' || i, 'Akun RA ' || i);
    perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', ub::text, true);
    perform public.claim_profile('rb-' || i, 'Akun RB ' || i);
    perform set_config('role', 'postgres', true);
  end loop;
end $$;
