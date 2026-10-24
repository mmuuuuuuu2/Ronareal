-- RONA — tes Phase 5: katalog (RLS, batas, CTA, foto, urutan, sampul, snapshot, publish, isolasi).
-- Jalankan setelah SEMUA migration (lihat scripts/test-db.sh). Berjalan pada Postgres lokal + shim, BUKAN Supabase asli.
-- Satu transaksi + ROLLBACK.

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
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;
-- Menyalin objek draft -> public (server aplikasi melakukannya lewat Storage API; di sini lewat tabel shim).
create or replace function pg_temp.copy_public(p_path text) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values ('public-assets', p_path) on conflict do nothing;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a5';
  b uuid := '00000000-0000-0000-0000-0000000000b5';
  pa uuid; pb uuid;
  i1 uuid; i2 uuid; i3 uuid; ib uuid; ihid uuid;
  img1 uuid; img2 uuid; img3 uuid; imgb uuid;
  p text; n int; v int; cfg jsonb; pub jsonb; st jsonb; nsnap bigint;
  ids uuid[];
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a5@example.test'),
    (b, 'authenticated', 'authenticated', 'b5@example.test');
  perform pg_temp.as_user(a); pa := public.claim_profile('katalog-a', 'Akun A');
  perform pg_temp.as_user(b); pb := public.claim_profile('katalog-b', 'Akun B');

  ------------------------------------------------------------------ item: tambah, posisi, validasi
  perform pg_temp.as_user(a);
  insert into public.page_links (page_id, title, url) values (pa, 'Situs', 'https://example.test/a');
  insert into public.catalog_items (page_id, title, summary, description, price_amount, price_label)
    values (pa, 'Paket Foto 📸', 'Ringkas', 'Deskripsi lengkap dengan emoji 🎉 dan aksara Indonesia: é ñ', 1500000, 'Mulai dari')
    returning id into i1;
  insert into public.catalog_items (page_id, title) values (pa, 'Item Dua') returning id into i2;
  insert into public.catalog_items (page_id, title, is_visible) values (pa, 'Item Tersembunyi', false) returning id into ihid;
  perform pg_temp.ok((select array_agg(position order by position) from public.catalog_items where page_id = pa) = array[0,1,2],
    'posisi item otomatis di akhir (0,1,2)');
  perform pg_temp.ok((select title from public.catalog_items where id = i1) = 'Paket Foto 📸', 'judul Unicode/emoji tersimpan utuh');

  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title) values (%L, %L)', pa, ''), 'judul kosong ditolak');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title) values (%L, %L)', pa, repeat('x', 121)), 'judul >120 ditolak');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title, summary) values (%L, %L, %L)', pa, 't', repeat('x', 161)), 'ringkasan >160 ditolak');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title, description) values (%L, %L, %L)', pa, 't', repeat('x', 2001)), 'deskripsi >2000 ditolak');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title, price_amount) values (%L, %L, -1)', pa, 't'), 'harga negatif ditolak');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title, price_label) values (%L, %L, %L)', pa, 't', repeat('x', 41)), 'label harga >40 ditolak');

  ------------------------------------------------------------------ CTA
  update public.catalog_items set cta_type = 'whatsapp', cta_value = '6281234567890', cta_label = 'Pesan sekarang', cta_message = 'Halo {judul}' where id = i1;
  perform pg_temp.ok((select cta_label from public.catalog_items where id = i1) = 'Pesan sekarang', 'CTA WhatsApp valid tersimpan; label kustom utuh');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''url'', cta_value = %L where id = %L', 'javascript:alert(1)', i1), 'CTA javascript: ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''url'', cta_value = %L where id = %L', 'data:text/html,x', i1), 'CTA data: ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''url'', cta_value = %L where id = %L', 'vbscript:x', i1), 'CTA vbscript: ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''url'', cta_value = %L where id = %L', 'http://example.test', i1), 'CTA url non-HTTPS ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''whatsapp'', cta_value = %L where id = %L', '+62 812', i1), 'WhatsApp dengan karakter non-digit ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''email'', cta_value = %L where id = %L', 'bukan-email', i1), 'email tak valid ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = ''phone'', cta_value = %L where id = %L', 'javascript:1', i1), 'telepon tak valid ditolak');
  perform pg_temp.expect_fail(format('update public.catalog_items set cta_type = null, cta_value = %L where id = %L', 'https://example.test', i1), 'nilai CTA tanpa tipe ditolak');
  update public.catalog_items set cta_type = 'url', cta_value = 'https://example.test/pesan?x=1' where id = i2;
  update public.catalog_items set cta_type = 'email', cta_value = 'halo@example.test' where id = ihid;
  update public.catalog_items set cta_type = null, cta_value = null where id = ihid;
  perform pg_temp.ok(true, 'CTA https/email valid diterima; CTA dapat dikosongkan (tanpa tujuan fiktif)');

  ------------------------------------------------------------------ kolom yang tidak boleh ditulis client
  perform pg_temp.expect_fail(format('update public.catalog_items set position = 9 where id = %L', i1), 'client tidak dapat menulis posisi item langsung');
  perform pg_temp.expect_fail(format('update public.catalog_items set cover_image_id = gen_random_uuid() where id = %L', i1), 'client tidak dapat menulis sampul langsung');
  perform pg_temp.expect_fail(format('update public.catalog_items set page_id = %L where id = %L', pb, i1), 'client tidak dapat memindahkan item ke page lain');

  ------------------------------------------------------------------ foto: path, objek, batas, sampul otomatis
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, a || '/catalog/ghost.webp'),
    'foto tanpa objek di draft-assets ditolak', '%image_object_missing%');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, b || '/catalog/punya-b.webp'),
    'foto dengan path folder akun lain ditolak', '%image_path_invalid%');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, a || '/catalog/x.svg'),
    'SVG ditolak sebagai path gambar', '%image_path_invalid%');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, a || '/avatar/x.webp'),
    'path di luar folder catalog ditolak', '%image_path_invalid%');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, a || '/catalog/../x.webp'),
    'path traversal ditolak', '%image_path_invalid%');

  for n in 1..7 loop
    insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/catalog/f' || n || '.webp');
    insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/catalog/f' || n || '-t.webp');
  end loop;
  insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/catalog/f8.webp');

  insert into public.catalog_images (item_id, storage_path, thumb_path, width, height, size_bytes, mime)
    values (i1, a || '/catalog/f1.webp', a || '/catalog/f1-t.webp', 1600, 1200, 120000, 'image/webp') returning id into img1;
  perform pg_temp.ok((select cover_image_id from public.catalog_items where id = i1) = img1, 'foto pertama otomatis menjadi sampul');
  insert into public.catalog_images (item_id, storage_path, thumb_path) values (i1, a || '/catalog/f2.webp', a || '/catalog/f2-t.webp') returning id into img2;
  insert into public.catalog_images (item_id, storage_path, thumb_path) values (i1, a || '/catalog/f3.webp', a || '/catalog/f3-t.webp') returning id into img3;
  perform pg_temp.ok((select cover_image_id from public.catalog_items where id = i1) = img1, 'foto kedua/ketiga tidak mengganti sampul');
  for n in 4..7 loop
    insert into public.catalog_images (item_id, storage_path, thumb_path) values (i1, a || '/catalog/f' || n || '.webp', a || '/catalog/f' || n || '-t.webp');
  end loop;
  perform pg_temp.ok((select count(*) from public.catalog_images where item_id = i1) = 7, '7 foto per item diterima');
  perform pg_temp.ok((select array_agg(position order by position) from public.catalog_images where item_id = i1) = array[0,1,2,3,4,5,6]::smallint[],
    'posisi foto otomatis 0..6');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, a || '/catalog/f8.webp'),
    'foto ke-8 ditolak di database', '%catalog_image_limit_reached%');
  perform pg_temp.expect_fail(format('update public.catalog_images set published_path = %L where id = %L', a || '/catalog/f1.webp', img1),
    'client tidak dapat menulis published_path');
  perform pg_temp.expect_fail(format('update public.catalog_images set position = 3 where id = %L', img1),
    'client tidak dapat mengubah posisi foto langsung');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, storage_path, published_path) values (%L, %L, %L)', i2, a || '/catalog/f8.webp', a || '/catalog/f8.webp'),
    'client tidak dapat menyisipkan published_path');

  ------------------------------------------------------------------ urutan foto & sampul
  perform public.reorder_catalog_images(i1, array[img3, img2, img1] || (select array_agg(id order by position) from public.catalog_images
                                         where item_id = i1 and id not in (img1, img2, img3)));
  perform pg_temp.ok((select position from public.catalog_images where id = img3) = 0 and (select position from public.catalog_images where id = img1) = 2,
    'urutan foto dapat diubah (tukar posisi dalam satu pernyataan)');
  perform pg_temp.ok((select cover_image_id from public.catalog_items where id = i1) = img1, 'mengurutkan foto tidak mengubah sampul');
  perform pg_temp.expect_fail(format('select public.reorder_catalog_images(%L, array[%L]::uuid[])', i1, img1), 'urutan foto tidak lengkap ditolak', '%reorder_mismatch%');
  perform public.set_catalog_cover(i1, img3);
  perform pg_temp.ok((select cover_image_id from public.catalog_items where id = i1) = img3, 'sampul dapat dipilih dari foto yang ada');
  delete from public.catalog_images where id = img3;
  perform pg_temp.ok((select cover_image_id from public.catalog_items where id = i1) is not null
                     and (select cover_image_id from public.catalog_items where id = i1) <> img3,
    'menghapus foto sampul memilih foto lain otomatis');
  perform pg_temp.ok((select count(*) from public.catalog_images where item_id = i1) = 6, 'foto terhapus');
  insert into public.catalog_images (item_id, storage_path) values (i1, a || '/catalog/f8.webp');
  perform pg_temp.ok((select count(*) from public.catalog_images where item_id = i1) = 7, 'slot kosong dipakai ulang setelah hapus (tetap maks 7)');

  ------------------------------------------------------------------ urutan item
  perform public.reorder_catalog_items(array[i2, ihid, i1]);
  perform pg_temp.ok((select position from public.catalog_items where id = i2) = 0 and (select position from public.catalog_items where id = i1) = 2, 'urutan item dapat diubah');
  perform pg_temp.expect_fail(format('select public.reorder_catalog_items(array[%L]::uuid[])', i1), 'urutan item tidak lengkap ditolak', '%reorder_mismatch%');
  perform public.reorder_catalog_items(array[i1, i2, ihid]);

  ------------------------------------------------------------------ pengaturan section
  perform public.set_catalog_settings(true, 'Karya Saya');
  select draft_config into cfg from public.pages where id = pa;
  perform pg_temp.ok(cfg #>> '{catalog,title}' = 'Karya Saya' and (cfg #>> '{catalog,enabled}')::boolean, 'judul & status section tersimpan di draft_config');
  perform pg_temp.expect_fail($q$select public.set_catalog_settings(true, '   ')$q$, 'judul section kosong ditolak', '%catalog_title_invalid%');
  perform pg_temp.expect_fail(format($q$select public.set_catalog_settings(true, %L)$q$, repeat('x', 41)), 'judul section >40 ditolak', '%catalog_title_invalid%');
  update public.pages set draft_config = draft_config || '{"settings":{"radius":"sm"}}'::jsonb where id = pa;
  perform public.set_catalog_settings(false, 'Layanan');
  select draft_config into cfg from public.pages where id = pa;
  perform pg_temp.ok(cfg #>> '{settings,radius}' = 'sm' and (cfg #>> '{catalog,enabled}')::boolean = false, 'pengaturan section tidak menimpa pengaturan tampilan');
  perform public.set_catalog_settings(true, 'Layanan');

  ------------------------------------------------------------------ isolasi A / B
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.catalog_items) = 0, 'B tidak dapat membaca item katalog A');
  perform pg_temp.ok((select count(*) from public.catalog_images) = 0, 'B tidak dapat membaca foto katalog A');
  update public.catalog_items set title = 'dibajak';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'B tidak dapat mengubah item A');
  delete from public.catalog_items;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'B tidak dapat menghapus item A');
  delete from public.catalog_images;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'B tidak dapat menghapus foto A');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title) values (%L, %L)', pa, 'masuk ke A'), 'B tidak dapat menyisipkan item ke page A');
  insert into storage.objects (bucket_id, name) values ('draft-assets', b || '/catalog/b1.webp');
  perform pg_temp.expect_fail(format('insert into public.catalog_images (item_id, storage_path) values (%L, %L)', i1, b || '/catalog/b1.webp'),
    'B tidak dapat menambah foto ke item A', '%catalog_item_not_found%');
  perform pg_temp.expect_fail(format('select public.reorder_catalog_items(array[%L, %L, %L]::uuid[])', i1, i2, ihid), 'B tidak dapat mengurutkan item A', '%reorder_mismatch%');
  perform pg_temp.expect_fail(format('select public.reorder_catalog_images(%L, array[%L]::uuid[])', i1, img1), 'B tidak dapat mengurutkan foto A', '%catalog_item_not_found%');
  perform pg_temp.expect_fail(format('select public.set_catalog_cover(%L, %L)', i1, img1), 'B tidak dapat mengubah sampul A', '%catalog_item_not_found%');
  insert into public.catalog_items (page_id, title) values (pb, 'Item B') returning id into ib;
  insert into public.catalog_images (item_id, storage_path) values (ib, b || '/catalog/b1.webp') returning id into imgb;
  perform pg_temp.expect_fail(format('select public.set_catalog_cover(%L, %L)', ib, img1), 'sampul item B tidak dapat memakai foto A', '%catalog_image_not_found%');
  perform public.set_catalog_settings(true, 'Punya B');
  perform pg_temp.as_user(a);
  select draft_config into cfg from public.pages where id = pa;
  perform pg_temp.ok(cfg #>> '{catalog,title}' = 'Layanan', 'pengaturan section B tidak menyentuh A');

  perform pg_temp.as_anon();
  perform pg_temp.expect_fail('select * from public.catalog_items', 'anon tidak dapat SELECT catalog_items');
  perform pg_temp.expect_fail('select * from public.catalog_images', 'anon tidak dapat SELECT catalog_images');
  perform pg_temp.expect_fail('select public.build_catalog_payload(gen_random_uuid(), false)', 'anon tidak dapat memanggil build_catalog_payload');
  perform pg_temp.expect_fail('select public.set_catalog_settings(true, ''x'')', 'anon tidak dapat memanggil set_catalog_settings');

  ------------------------------------------------------------------ publish: aset katalog harus punya salinan publik
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail('select public.publish_page_with_assets()', 'publish ditolak bila foto katalog belum disalin ke public',
    '%assets_not_published%');
  perform pg_temp.ok((select count(*) from public.published_snapshots where page_id = pa) = 0, 'publish gagal => tidak ada snapshot');
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('katalog-a') is null, 'sebelum publish halaman tidak publik (katalog draft tidak bocor)');

  -- Baris palsu: superuser memaksa foto dengan path folder akun B pada item A. Publish harus menolaknya.
  perform pg_temp.as_admin();
  insert into public.catalog_images (id, item_id, position, storage_path) values (gen_random_uuid(), i2, 0, b || '/catalog/b1.webp') returning id into p;
  perform pg_temp.copy_public(b || '/catalog/b1.webp');
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail('select public.publish_page_with_assets()', 'path milik akun lain pada item tidak dapat terbit', '%assets_not_published%');
  perform pg_temp.as_admin();
  delete from public.catalog_images where item_id = i2;
  perform pg_temp.as_user(a);

  -- Salin objek publik untuk item A yang tampil (server aplikasi melakukannya lewat Storage API)
  perform pg_temp.as_admin();
  for p in select storage_path from public.catalog_images where item_id = i1 loop perform pg_temp.copy_public(p); end loop;
  for p in select thumb_path from public.catalog_images where item_id = i1 and thumb_path is not null loop perform pg_temp.copy_public(p); end loop;
  perform pg_temp.as_user(a);
  v := public.publish_page_with_assets();
  perform pg_temp.ok(v = 1, 'publish pertama dengan katalog berhasil (v1)');

  perform pg_temp.as_anon();
  pub := public.get_public_page('katalog-a');
  perform pg_temp.ok(pub is not null, 'anon membaca snapshot katalog yang terbit');
  perform pg_temp.ok(jsonb_array_length(pub -> 'catalog') = 2, 'snapshot memuat item tampil saja (item tersembunyi tidak ikut)');
  perform pg_temp.ok(pub::text not like '%Item Tersembunyi%', 'item nonaktif tidak ada di payload publik');
  perform pg_temp.ok(pub #>> '{catalog,0,title}' = 'Paket Foto 📸' and jsonb_array_length(pub #> '{catalog,0,images}') = 7,
    'item terbit lengkap dengan 7 foto, urutan sesuai');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(pub #> '{catalog,0,images}') e where e ->> 'thumb' like a::text || '/catalog/%') >= 5, 'path thumbnail publik ada');
  perform pg_temp.ok(pub::text not like '%storage_path%' and pub::text not like '%published_path%' and pub::text not like '%owner_id%',
    'payload publik tidak membocorkan field internal');

  ------------------------------------------------------------------ draft terpisah dari live
  perform pg_temp.as_user(a);
  st := public.get_publish_state();
  perform pg_temp.ok((st ->> 'has_changes')::boolean = false, 'tepat setelah publish: tidak ada perubahan tertunda');
  update public.catalog_items set title = 'Judul Draft Baru' where id = i1;
  update public.catalog_items set is_visible = false where id = i2;
  delete from public.catalog_images where id = img1;
  perform pg_temp.as_anon();
  pub := public.get_public_page('katalog-a');
  perform pg_temp.ok(pub::text not like '%Judul Draft Baru%', 'mengedit item tidak mengubah halaman live');
  perform pg_temp.ok(jsonb_array_length(pub -> 'catalog') = 2 and pub::text like '%Item Dua%', 'menonaktifkan item di draft tidak menghilangkannya dari live');
  perform pg_temp.ok(jsonb_array_length(pub #> '{catalog,0,images}') = 7, 'menghapus foto di draft tidak mengubah live');
  perform pg_temp.as_user(a);
  st := public.get_publish_state();
  perform pg_temp.ok((st ->> 'has_changes')::boolean, 'perubahan katalog terdeteksi sebagai "belum diterbitkan"');

  -- Publish gagal (foto baru tanpa salinan publik) tidak merusak v1.
  insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/catalog/baru.webp');
  insert into public.catalog_images (item_id, storage_path) values (i1, a || '/catalog/baru.webp');
  perform pg_temp.expect_fail('select public.publish_page_with_assets()', 'publish gagal saat foto baru belum disalin', '%assets_not_published%');
  perform pg_temp.as_anon();
  pub := public.get_public_page('katalog-a');
  perform pg_temp.ok(pub::text not like '%Judul Draft Baru%' and (pub ->> 'version')::int = 1, 'publish gagal => snapshot lama utuh');
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.published_snapshots where page_id = pa) = 1, 'publish gagal => tidak menambah snapshot');
  perform pg_temp.ok((select published_path from public.catalog_images where item_id = i1 and storage_path = a || '/catalog/baru.webp') is null,
    'transaksi dibatalkan: tidak ada path publik setengah jadi');

  -- Republish setelah salinan publik siap.
  perform pg_temp.as_admin();
  perform pg_temp.copy_public(a || '/catalog/baru.webp');
  perform pg_temp.as_user(a);
  v := public.publish_page_with_assets();
  perform pg_temp.ok(v = 2, 'republish setelah mengubah katalog (v2)');
  perform pg_temp.as_anon();
  pub := public.get_public_page('katalog-a');
  perform pg_temp.ok(pub::text like '%Judul Draft Baru%' and jsonb_array_length(pub -> 'catalog') = 1 and (pub ->> 'version')::int = 2,
    'live v2: judul baru, item nonaktif hilang, versi naik');
  perform pg_temp.as_user(a);
  perform pg_temp.ok(((public.get_publish_state()) ->> 'has_changes')::boolean = false, 'setelah republish tidak ada perubahan tertunda');
  perform pg_temp.ok((select count(*) from public.published_snapshots where page_id = pa) = 2, 'riwayat snapshot immutable: 2 versi');

  ------------------------------------------------------------------ section nonaktif: katalog tidak ikut snapshot
  perform pg_temp.as_user(a);
  perform public.set_catalog_settings(false, 'Layanan');
  insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/catalog/tanpa-salin.webp');
  perform pg_temp.ok((public.get_publish_state() ->> 'has_changes')::boolean, 'menonaktifkan section = perubahan belum terbit');
  perform pg_temp.as_admin();
  update public.page_links set image_path = null where page_id = pa;
  perform pg_temp.as_user(a);
  v := public.publish_page_with_assets();
  perform pg_temp.as_anon();
  pub := public.get_public_page('katalog-a');
  perform pg_temp.ok(jsonb_array_length(pub -> 'catalog') = 0 and (pub #>> '{config,catalog,enabled}') = 'false',
    'section nonaktif: katalog kosong di snapshot (foto tidak perlu disalin ke publik)');
  perform pg_temp.as_user(a);
  perform public.set_catalog_settings(true, 'Layanan');
  perform public.publish_page_with_assets();  -- kembali aktif: katalog ikut lagi
  perform pg_temp.as_anon();
  perform pg_temp.ok(jsonb_array_length(public.get_public_page('katalog-a') -> 'catalog') = 1, 'section diaktifkan lagi: katalog kembali di snapshot baru');

  ------------------------------------------------------------------ B tidak dapat menerbitkan/membatalkan A; snapshot B tak memuat data A
  perform pg_temp.as_user(b);
  insert into public.page_links (page_id, title, url) values (pb, 'Situs B', 'https://example.test/b');
  perform pg_temp.as_admin(); perform pg_temp.copy_public(b || '/catalog/b1.webp'); perform pg_temp.as_user(b);
  v := public.publish_page_with_assets();
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('katalog-b')::text not like '%Judul Draft Baru%' and public.get_public_page('katalog-b')::text not like '%Paket Foto%',
    'snapshot B tidak memuat item A');
  perform pg_temp.ok(public.get_public_page('katalog-a')::text not like '%Item B%', 'snapshot A tidak memuat item B');
  perform pg_temp.as_user(b);
  perform public.unpublish_page();
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('katalog-a') is not null and public.get_public_page('katalog-b') is null,
    'B membatalkan penerbitan miliknya tidak memengaruhi A');

  ------------------------------------------------------------------ unpublish menutup akses; hapus item menghapus foto (cascade)
  perform pg_temp.as_user(a);
  perform public.unpublish_page();
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('katalog-a') is null, 'setelah unpublish halaman & katalog tidak publik');
  perform pg_temp.as_user(a);
  delete from public.catalog_items where id = i1;
  perform pg_temp.as_admin();
  perform pg_temp.ok((select count(*) from public.catalog_images where item_id = i1) = 0, 'menghapus item menghapus foto-fotonya (cascade)');

  ------------------------------------------------------------------ batas item
  perform pg_temp.as_user(a);
  for n in 1..30 loop
    begin
      insert into public.catalog_items (page_id, title) values (pa, 'Batas ' || n);
    exception when others then
      exit;
    end;
  end loop;
  perform pg_temp.ok((select count(*) from public.catalog_items where page_id = pa) = 30, 'jumlah item dibatasi 30 per halaman');
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title) values (%L, %L)', pa, 'ke-31'), 'item ke-31 ditolak', '%catalog_item_limit_reached%');

  raise notice 'SELESAI: tes Phase 5 lulus';
end $$;

rollback;
