-- RONA — tes Phase 3: link manager, reorder, ganti username, isolasi draft dan link.
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
  a uuid := '00000000-0000-0000-0000-0000000000f1';
  b uuid := '00000000-0000-0000-0000-0000000000f2';
  pa uuid; pb uuid;
  la1 uuid; la2 uuid; la3 uuid; lb1 uuid;
  n bigint; pos int[]; u text;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'f1@example.test'),
    (b, 'authenticated', 'authenticated', 'f2@example.test');
  perform pg_temp.as_user(a); pa := public.claim_profile('akun-a3', 'Akun A');
  perform pg_temp.as_user(b); pb := public.claim_profile('akun-b3', 'Akun B');

  -- ===== URL skema =====
  perform pg_temp.as_user(a);
  insert into public.page_links (page_id, title, url) values (pa, 'Satu', 'https://example.com/a') returning id into la1;
  insert into public.page_links (page_id, title, url) values (pa, 'Dua', 'mailto:hi@example.com') returning id into la2;
  insert into public.page_links (page_id, title, url) values (pa, 'Tiga', 'tel:+62812345678') returning id into la3;
  raise notice 'PASS: url https/mailto/tel diterima';
  perform pg_temp.expect_fail($q$insert into public.page_links (page_id, title, url) select id, 'x', 'javascript:alert(1)' from public.pages where owner_id = auth.uid()$q$, 'javascript: ditolak', '%page_links_url_scheme%');
  perform pg_temp.expect_fail($q$insert into public.page_links (page_id, title, url) select id, 'x', 'data:text/html;base64,AAAA' from public.pages where owner_id = auth.uid()$q$, 'data: ditolak', '%page_links_url_scheme%');
  perform pg_temp.expect_fail($q$insert into public.page_links (page_id, title, url) select id, 'x', 'JaVaScRiPt:alert(1)' from public.pages where owner_id = auth.uid()$q$, 'javascript: campur huruf besar ditolak', '%page_links_url_scheme%');
  perform pg_temp.expect_fail($q$insert into public.page_links (page_id, title, url) select id, 'x', E'https://a.com/\nb' from public.pages where owner_id = auth.uid()$q$, 'url dengan karakter kontrol ditolak', '%page_links_url_scheme%');
  perform pg_temp.expect_fail($q$update public.page_links set url = 'vbscript:x' where id = '$q$ || la1 || $q$'$q$, 'update ke skema berbahaya ditolak', '%page_links_url_scheme%');

  -- ===== posisi otomatis =====
  select array_agg(position order by position) into pos from public.page_links where page_id = pa;
  if pos <> array[0,1,2] then raise exception 'FAIL: posisi otomatis salah %', pos; end if;
  raise notice 'PASS: posisi link baru otomatis berurutan di akhir';

  -- ===== reorder =====
  perform public.reorder_links(array[la3, la1, la2]);
  if (select array_agg(id order by position) from public.page_links where page_id = pa) <> array[la3, la1, la2] then
    raise exception 'FAIL: urutan tidak sesuai';
  end if;
  raise notice 'PASS: reorder_links menyimpan urutan baru';
  perform pg_temp.expect_fail(format($q$select public.reorder_links(array['%s','%s']::uuid[])$q$, la1, la2), 'reorder dengan daftar kurang ditolak', '%reorder_mismatch%');
  perform pg_temp.expect_fail(format($q$select public.reorder_links(array['%s','%s','%s']::uuid[])$q$, la1, la1, la2), 'reorder dengan duplikat ditolak', '%reorder_mismatch%');
  if (select array_agg(id order by position) from public.page_links where page_id = pa) <> array[la3, la1, la2] then
    raise exception 'FAIL: reorder gagal mengubah urutan lama';
  end if;
  raise notice 'PASS: reorder gagal tidak mengubah urutan yang ada';

  -- ===== isolasi A vs B =====
  perform pg_temp.as_user(b);
  insert into public.page_links (page_id, title, url) values (pb, 'B1', 'https://b.example') returning id into lb1;
  perform pg_temp.expect_fail(format($q$select public.reorder_links(array['%s','%s','%s','%s']::uuid[])$q$, la1, la2, la3, lb1), 'B tidak bisa memasukkan link A ke urutannya', '%reorder_mismatch%');
  perform pg_temp.expect_fail(format($q$select public.reorder_links(array['%s']::uuid[])$q$, la1), 'B tidak bisa reorder dengan id link A', '%reorder_mismatch%');
  select count(*) into n from public.page_links where id in (la1, la2, la3);
  if n <> 0 then raise exception 'FAIL: B bisa membaca link A (%)', n; end if;
  raise notice 'PASS: B tidak dapat membaca link A';
  update public.page_links set title = 'diretas' where id = la1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B dapat mengubah link A'; end if;
  delete from public.page_links where id = la1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B dapat menghapus link A'; end if;
  raise notice 'PASS: B tidak dapat mengubah/menghapus link A (0 baris terpengaruh)';
  perform pg_temp.expect_fail(format($q$insert into public.page_links (page_id, title, url) values ('%s', 'x', 'https://x.example')$q$, pa), 'B tidak bisa menyisipkan link ke halaman A', '%row-level security%');
  update public.pages set draft_config = '{"hack":true}' where id = pa;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B dapat mengubah draft A'; end if;
  select count(*) into n from public.pages where id = pa;
  if n <> 0 then raise exception 'FAIL: B dapat membaca draft A'; end if;
  raise notice 'PASS: B tidak dapat membaca/mengubah draft A';

  -- ===== draft tersimpan untuk pemilik, status publikasi tak bisa diubah =====
  perform pg_temp.as_user(a);
  update public.pages set draft_config = '{"v":1,"settings":{"align":"left"}}' where id = pa;
  select count(*) into n from public.pages where id = pa and draft_config->>'v' = '1';
  if n <> 1 then raise exception 'FAIL: draft A tidak tersimpan'; end if;
  raise notice 'PASS: draft tersimpan dan dibaca ulang oleh pemilik';
  perform pg_temp.expect_fail(format($q$update public.pages set is_published = true where id = '%s'$q$, pa), 'client tidak bisa menerbitkan langsung', '%permission denied%');
  perform pg_temp.expect_fail(format($q$update public.pages set draft_config = '[]' where id = '%s'$q$, pa), 'draft_config bukan objek ditolak', '%pages_draft_config_object%');

  -- ===== path gambar =====
  perform pg_temp.expect_fail(format($q$update public.page_links set image_path = '%s/link/x.png' where id = '%s'$q$, b, la1), 'path gambar milik user lain ditolak (link)', '%image_path_invalid%');
  perform pg_temp.expect_fail($q$update public.page_links set image_path = '../x.png'$q$, 'path traversal ditolak (link)', '%image_path_invalid%');
  update public.page_links set image_path = a::text || '/link/foto-1.webp' where id = la1;
  perform pg_temp.expect_fail(format($q$update public.profiles set avatar_path = '%s/avatar/x.png' where id = '%s'$q$, b, a), 'avatar milik user lain ditolak', '%image_path_invalid%');
  perform pg_temp.expect_fail(format($q$update public.pages set background_path = '%s/avatar/x.png' where id = '%s'$q$, a, pa), 'background di folder avatar ditolak', '%image_path_invalid%');
  update public.profiles set avatar_path = a::text || '/avatar/me.png' where id = a;
  update public.pages set background_path = a::text || '/background/bg.jpg' where id = pa;
  raise notice 'PASS: path gambar hanya diterima bila milik sendiri dan berpola baku';

  -- ===== batas jumlah link =====
  perform pg_temp.as_admin();
  insert into public.page_links (page_id, title, url) select pa, 'bulk ' || g, 'https://e.example/' || g from generate_series(1, 47) g;
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail(format($q$insert into public.page_links (page_id, title, url) values ('%s', 'lebih', 'https://e.example')$q$, pa), 'link ke-51 ditolak', '%link_limit_reached%');
  raise notice 'PASS: batas 50 link per halaman';

  -- ===== change_username =====
  select public.change_username('  Nama-Baru-A ') into u;
  if u <> 'nama-baru-a' then raise exception 'FAIL: change_username hasil %', u; end if;
  raise notice 'PASS: change_username menormalisasi dan menyimpan';
  perform pg_temp.expect_fail($q$select public.change_username('akun-b3')$q$, 'username milik user lain ditolak', '%username_taken%');
  perform pg_temp.expect_fail($q$select public.change_username('admin')$q$, 'username reserved ditolak', '%username_reserved%');
  perform pg_temp.expect_fail($q$select public.change_username('-bad-')$q$, 'format salah ditolak', '%username_invalid%');
  if public.change_username('nama-baru-a') <> 'nama-baru-a' then raise exception 'FAIL: no-op'; end if;
  perform pg_temp.as_anon();
  perform pg_temp.expect_fail($q$select public.change_username('xyz-123')$q$, 'anon tidak bisa change_username', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.reorder_links('{}')$q$, 'anon tidak bisa reorder_links', '%permission denied%');
  -- terbit => username BOLEH diganti (Phase 7 mencabut kunci Phase 3; kunci URL ditangani get_public_page)
  perform pg_temp.as_admin();
  update public.pages set is_published = true where id = pa;
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.change_username('lain-lagi-a') = 'lain-lagi-a', 'username boleh diganti saat halaman terbit (Phase 7)');

  perform pg_temp.as_admin();
  raise notice 'SELESAI: tes Phase 3 lulus';
end $$;

rollback;
