-- Data PERMANEN (commit) untuk tes simpan draft vs ubah katalog secara paralel; dijalankan oleh scripts/test-db.sh pada DB sementara.
begin;
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000f6', 'authenticated', 'authenticated', 'f6@example.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', true);
set local role authenticated;
select public.claim_profile('paralel-f6', 'Akun Paralel');
commit;
