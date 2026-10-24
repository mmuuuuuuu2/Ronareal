-- Data PERMANEN (commit) untuk tes urutan kunci publish vs simpan draft; dijalankan oleh scripts/test-db.sh pada DB sementara.
begin;
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000d8', 'authenticated', 'authenticated', 'd8@example.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d8","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d8', true);
set local role authenticated;
select public.claim_profile('kunci-d8', 'Akun Kunci');
reset role;
insert into public.page_links (page_id, title, url)
  select id, 'Tautan', 'https://kunci.example' from public.pages where owner_id = '00000000-0000-0000-0000-0000000000d8';
-- Avatar + objek publik: publish kini juga MENULIS baris profil (kunci profiles) sehingga urutan kunci teruji.
update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000d8/avatar/kunci.png' where id = '00000000-0000-0000-0000-0000000000d8';
insert into storage.objects (bucket_id, name, owner) values ('public-assets', '00000000-0000-0000-0000-0000000000d8/avatar/kunci.png', '00000000-0000-0000-0000-0000000000d8');
commit;
