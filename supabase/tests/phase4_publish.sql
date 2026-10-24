-- RONA — tes Phase 4: publish, unpublish, snapshot, aset publik, otorisasi dan isolasi.
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
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;
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
  a uuid := '00000000-0000-0000-0000-0000000000a4';
  b uuid := '00000000-0000-0000-0000-0000000000b4';
  c uuid := '00000000-0000-0000-0000-0000000000c4';
  pa uuid; pb uuid; pc uuid;
  la1 uuid; la2 uuid; lahid uuid;
  av text; bg text; li text; li2 text;
  v int; st jsonb; pub jsonb; n bigint; nsnap bigint;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a4@example.test'),
    (b, 'authenticated', 'authenticated', 'b4@example.test'),
    (c, 'authenticated', 'authenticated', 'c4@example.test');
  perform pg_temp.as_user(a); pa := public.claim_profile('publik-a', 'Akun A');
  perform pg_temp.as_user(b); pb := public.claim_profile('publik-b', 'Akun B');
  perform pg_temp.as_user(c); pc := public.claim_profile('publik-c', 'Akun C');

  -- ===== siapkan draft A =====
  perform pg_temp.as_user(a);
  av := a::text || '/avatar/av-1.webp';
  bg := a::text || '/background/bg-1.webp';
  li := a::text || '/link/li-1.webp';
  update public.profiles set avatar_path = av, bio = 'Bio A' where id = a;
  update public.pages set background_path = bg, draft_config = '{"version":1,"settings":{"radius":"sm"}}' where id = pa;
  insert into public.page_links (page_id, title, url) values (pa, 'Satu', 'https://satu.example') returning id into la1;
  insert into public.page_links (page_id, title, url, image_path) values (pa, 'Dua', 'https://dua.example', li) returning id into la2;
  insert into public.page_links (page_id, title, url, is_visible) values (pa, 'Tersembunyi', 'https://hidden.example', false) returning id into lahid;

  -- ===== status awal =====
  st := public.get_publish_state();
  if (st->>'is_published')::boolean or st->'version' <> 'null'::jsonb or not (st->>'has_changes')::boolean then
    raise exception 'FAIL: status awal salah %', st; end if;
  raise notice 'PASS: status awal = draft, belum pernah terbit';
  if public.get_public_page('publik-a') is not null then raise exception 'FAIL: draft bocor ke publik'; end if;
  raise notice 'PASS: sebelum publish, halaman publik tidak ada';

  -- ===== publish gagal karena aset publik belum disalin: aman =====
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{}'::jsonb)$q$, av, bg), 'publish ditolak bila aset belum disalin', '%assets_not_published%');
  select count(*) into nsnap from public.published_snapshots where page_id = pa;
  if nsnap <> 0 then raise exception 'FAIL: snapshot setengah jadi'; end if;
  perform pg_temp.as_admin();
  select count(*) into n from public.profiles where id = a and avatar_published_path is not null;
  if n <> 0 then raise exception 'FAIL: path publik tertinggal setelah publish gagal'; end if;
  raise notice 'PASS: publish gagal tidak meninggalkan snapshot maupun path publik (rollback)';

  -- ===== salin aset (meniru server: tulis ke public-assets di folder sendiri) =====
  perform pg_temp.as_user(a);
  insert into storage.objects (bucket_id, name, owner) values ('public-assets', av, a), ('public-assets', bg, a), ('public-assets', li, a);

  -- validasi muatan
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{}'::jsonb)$q$, av, bg), 'link bergambar tanpa peta ditolak', '%assets_not_published%');
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s/avatar/lain.webp','%s','{"%s":"%s"}'::jsonb)$q$, a, bg, la2, li), 'avatar path bukan milik draft ditolak', '%assets_not_published%');
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{"%s":"%s","%s":"%s"}'::jsonb)$q$, av, bg, la2, li, la1, li), 'peta memuat link tanpa gambar ditolak', '%assets_invalid%');
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{"%s":"%s"}'::jsonb)$q$, av, bg, la2, b::text || '/link/x.webp'), 'path milik user lain ditolak', '%assets_not_published%');
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','[]'::jsonb)$q$, av, bg), 'peta bukan objek ditolak', '%assets_invalid%');

  -- ===== publish pertama =====
  v := public.publish_page_with_assets(av, bg, jsonb_build_object(la2::text, li));
  if v <> 1 then raise exception 'FAIL: versi pertama %', v; end if;
  pub := public.get_public_page('Publik-A');   -- huruf besar dinormalisasi
  if pub is null then raise exception 'FAIL: halaman publik tidak tersedia'; end if;
  if (pub->>'version')::int <> 1 or pub->>'published_at' is null then raise exception 'FAIL: version/published_at tidak ada'; end if;
  if jsonb_array_length(pub->'links') <> 2 then raise exception 'FAIL: link nonaktif ikut terbit atau jumlah salah'; end if;
  if pub::text like '%hidden.example%' or pub::text like '%Tersembunyi%' then raise exception 'FAIL: link nonaktif bocor'; end if;
  if pub#>>'{profile,avatar_path}' <> av or pub->>'background_path' <> bg then raise exception 'FAIL: aset publik tidak ada di snapshot'; end if;
  if (pub#>>'{links,1,image_path}') <> li then raise exception 'FAIL: gambar link tidak ada'; end if;
  if pub#>>'{config,settings,radius}' <> 'sm' then raise exception 'FAIL: pengaturan visual tidak ada'; end if;
  st := public.get_publish_state();
  if not (st->>'is_published')::boolean or (st->>'has_changes')::boolean or (st->>'version')::int <> 1 then
    raise exception 'FAIL: status setelah publish salah %', st; end if;
  raise notice 'PASS: publish pertama: snapshot berisi profil, visual, link aktif berurutan, aset publik; status = published tanpa perubahan';

  -- anon membaca; tabel draft tetap tertutup
  perform pg_temp.as_anon();
  if public.get_public_page('publik-a') is null then raise exception 'FAIL: anon tidak bisa membaca halaman terbit'; end if;
  perform pg_temp.expect_fail($q$select * from public.pages$q$, 'anon tidak bisa membaca tabel pages', '%permission denied%');
  perform pg_temp.expect_fail($q$select * from public.page_links$q$, 'anon tidak bisa membaca tabel page_links', '%permission denied%');
  perform pg_temp.expect_fail($q$select * from public.published_snapshots$q$, 'anon tidak bisa membaca snapshot langsung', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.publish_page_with_assets()$q$, 'anon tidak bisa publish', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.unpublish_page()$q$, 'anon tidak bisa unpublish', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.get_publish_state()$q$, 'anon tidak bisa membaca status publish', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.build_draft_payload('00000000-0000-0000-0000-0000000000a4')$q$, 'build_draft_payload tidak dapat dipanggil client', '%permission denied%');
  raise notice 'PASS: anon hanya membaca snapshot lewat get_public_page; draft dan fungsi publish tertutup';

  -- ===== edit draft tidak mengubah live =====
  perform pg_temp.as_user(a);
  update public.page_links set title = 'Satu (diedit)' where id = la1;
  update public.profiles set bio = 'Bio baru' where id = a;
  pub := public.get_public_page('publik-a');
  if pub::text like '%diedit%' or pub::text like '%Bio baru%' then raise exception 'FAIL: draft mengubah versi live'; end if;
  st := public.get_publish_state();
  if not (st->>'has_changes')::boolean or not (st->>'is_published')::boolean then raise exception 'FAIL: has_changes tidak terdeteksi %', st; end if;
  raise notice 'PASS: edit draft tidak mengubah live; status = changes not published';

  -- ===== publish ulang =====
  v := public.publish_page_with_assets(av, bg, jsonb_build_object(la2::text, li));
  if v <> 2 then raise exception 'FAIL: versi kedua %', v; end if;
  pub := public.get_public_page('publik-a');
  if pub::text not like '%Satu (diedit)%' or (pub->>'version')::int <> 2 then raise exception 'FAIL: versi baru tidak live'; end if;
  if (public.get_publish_state()->>'has_changes')::boolean then raise exception 'FAIL: has_changes seharusnya false'; end if;
  raise notice 'PASS: publish ulang setelah edit: versi 2 live, tanpa perubahan tertunda';

  -- ===== penggantian gambar: path baru wajib disalin dulu =====
  li2 := a::text || '/link/li-2.webp';
  update public.page_links set image_path = li2 where id = la2;
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{"%s":"%s"}'::jsonb)$q$, av, bg, la2, li2), 'gambar baru belum disalin ditolak', '%assets_not_published%');
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{"%s":"%s"}'::jsonb)$q$, av, bg, la2, li), 'path lama untuk gambar baru ditolak', '%assets_not_published%');
  pub := public.get_public_page('publik-a');
  if (pub->>'version')::int <> 2 or (pub#>>'{links,1,image_path}') <> li then raise exception 'FAIL: live berubah setelah publish gagal'; end if;
  raise notice 'PASS: publish gagal melindungi snapshot live sebelumnya (versi & gambar lama utuh)';
  insert into storage.objects (bucket_id, name, owner) values ('public-assets', li2, a);
  v := public.publish_page_with_assets(av, bg, jsonb_build_object(la2::text, li2));
  if v <> 3 or (public.get_public_page('publik-a')#>>'{links,1,image_path}') <> li2 then raise exception 'FAIL: gambar baru tidak terbit'; end if;
  raise notice 'PASS: gambar yang diganti terbit setelah disalin (versi 3)';

  -- ===== link tidak valid / halaman kosong =====
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select public.publish_page_with_assets()$q$, 'halaman tanpa link aktif ditolak', '%no_visible_links%');
  insert into public.page_links (page_id, title, url) values (pb, 'B1', 'https://b.example');
  perform public.publish_page_with_assets();
  raise notice 'PASS: B dapat menerbitkan halamannya sendiri tanpa aset';

  -- ===== otorisasi & isolasi A vs B =====
  if (public.get_publish_state()->>'version')::int <> 1 then raise exception 'FAIL: status B tercampur dengan A'; end if;
  perform pg_temp.expect_fail(format($q$select public.publish_page_with_assets('%s','%s','{}'::jsonb)$q$, av, bg), 'B tidak dapat memakai path aset A', '%assets_invalid%');
  perform public.unpublish_page();   -- hanya halaman B
  if public.get_public_page('publik-b') is not null then raise exception 'FAIL: B tetap live setelah unpublish'; end if;
  if public.get_public_page('publik-a') is null then raise exception 'FAIL: unpublish B mematikan halaman A'; end if;
  select count(*) into n from public.pages where id = pa;
  if n <> 0 then raise exception 'FAIL: B membaca draft A'; end if;
  raise notice 'PASS: B tidak dapat membaca draft A, unpublish B tidak mempengaruhi A';
  perform pg_temp.as_user(c);
  if public.unpublish_page() then raise exception 'FAIL: unpublish halaman yang belum terbit seharusnya false'; end if;
  perform pg_temp.expect_fail($q$select public.publish_page_with_assets()$q$, 'C tanpa link aktif ditolak', '%no_visible_links%');
  perform pg_temp.as_admin();
  select count(*) into n from public.published_snapshots where page_id in (pb, pc);
  if n <> 1 then raise exception 'FAIL: jumlah snapshot B/C salah (%)', n; end if;

  -- user baru tanpa halaman tidak bisa publish
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  perform pg_temp.expect_fail($q$select public.publish_page_with_assets()$q$, 'user tanpa halaman ditolak', '%page_not_found%');

  -- ===== unpublish A, lalu publish ulang =====
  perform pg_temp.as_user(a);
  if not public.unpublish_page() then raise exception 'FAIL: unpublish A'; end if;
  if public.get_public_page('publik-a') is not null then raise exception 'FAIL: halaman A masih publik setelah unpublish'; end if;
  st := public.get_publish_state();
  if (st->>'is_published')::boolean or (st->>'version')::int <> 3 then raise exception 'FAIL: status setelah unpublish %', st; end if;
  if public.unpublish_page() then raise exception 'FAIL: unpublish ganda seharusnya false'; end if;
  raise notice 'PASS: unpublish menutup akses publik; unpublish ganda aman';
  update public.page_links set title = 'Saat tidak terbit' where id = la1;
  v := public.publish_page_with_assets(av, bg, jsonb_build_object(la2::text, li2));
  if v <> 4 or public.get_public_page('publik-a')::text not like '%Saat tidak terbit%' then raise exception 'FAIL: publish ulang setelah unpublish'; end if;
  raise notice 'PASS: publish ulang setelah unpublish membuat versi baru (4)';

  -- ===== snapshot lama immutable, tak bisa diubah client =====
  perform pg_temp.expect_fail($q$update public.published_snapshots set payload = '{}'$q$, 'client tidak bisa mengubah snapshot', '%permission denied%');
  perform pg_temp.expect_fail($q$delete from public.published_snapshots$q$, 'client tidak bisa menghapus snapshot', '%permission denied%');
  perform pg_temp.expect_fail(format($q$update public.pages set is_published = false where id = '%s'$q$, pa), 'client tidak bisa memalsukan status publikasi', '%permission denied%');
  perform pg_temp.expect_fail(format($q$update public.page_links set image_published_path = '%s' where id = '%s'$q$, li, la2), 'client tidak bisa menulis path publik langsung', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.publish_page()$q$, 'client tidak bisa memanggil publish_page() langsung', '%permission denied%');
  perform pg_temp.expect_fail(format($q$update public.profiles set avatar_published_path = '%s/avatar/palsu.png' where id = '%s'$q$, a, a), 'client tidak bisa menulis avatar_published_path', '%permission denied%');
  perform pg_temp.expect_fail(format($q$insert into public.page_links (page_id, title, url, image_published_path) values ('%s','x','https://x.example','%s/link/palsu.png')$q$, pa, a), 'client tidak bisa menyisipkan image_published_path', '%permission denied%');
  perform pg_temp.as_admin();
  select count(*) into nsnap from public.published_snapshots where page_id = pa;
  if nsnap <> 4 then raise exception 'FAIL: riwayat snapshot A seharusnya 4, ada %', nsnap; end if;
  raise notice 'PASS: riwayat snapshot immutable (4 versi) dan tidak bisa dimanipulasi client';

  -- ===== username unik =====
  perform pg_temp.as_user(c);
  perform pg_temp.expect_fail($q$select public.change_username('publik-a')$q$, 'username A tidak dapat diambil C', '%username_taken%');
  perform pg_temp.as_user(a);
  -- Phase 7: username boleh diganti saat terbit; URL baru melayani snapshot yang sama, URL lama 404, lalu dikembalikan.
  perform pg_temp.ok(public.change_username('publik-baru') = 'publik-baru', 'username boleh diganti saat terbit (Phase 7)');
  perform pg_temp.ok(public.get_public_page('publik-a') is null, 'URL lama tidak lagi melayani halaman');
  perform pg_temp.ok(public.get_public_page('publik-baru') #>> '{profile,username}' = 'publik-baru', 'URL baru melayani snapshot dengan username baru');
  perform pg_temp.ok(public.change_username('publik-a') = 'publik-a', 'pemilik lama boleh mengambil kembali namanya (karantina tidak berlaku untuk dirinya)');

  perform pg_temp.as_admin();
  raise notice 'SELESAI: tes Phase 4 lulus';
end $$;

rollback;
