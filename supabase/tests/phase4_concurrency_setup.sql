-- Menyiapkan data PERMANEN (commit) untuk tes publish bersamaan; dijalankan oleh scripts/test-db.sh pada DB sementara.
begin;
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated', 'e5@example.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', true);
set local role authenticated;
select public.claim_profile('balapan-e5', 'Akun Balapan');
insert into public.page_links (page_id, title, url)
  select id, 'Tautan', 'https://balapan.example' from public.pages where owner_id = '00000000-0000-0000-0000-0000000000e5';
commit;
