-- RONA — tes isolasi RLS: pengguna A tidak boleh membaca/mengubah data privat pengguna B.
-- Jalankan terhadap database Supabase LOKAL (jangan produksi), setelah migration diterapkan:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
-- Seluruh tes berjalan dalam satu transaksi dan di-ROLLBACK di akhir. Gagal => exception.

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
begin
  perform set_config('role', 'postgres', true);
end $$;

-- Pernyataan HARUS gagal (exception).
create or replace function pg_temp.publish_core() returns integer language plpgsql as $$
declare v integer; r text := current_setting('role');
begin
  -- publish_page() tidak lagi dapat dipanggil client (migration Phase 4); tes inti memanggilnya sebagai pemilik fungsi
  -- dengan identitas (claims) pengguna tetap dipertahankan.
  perform set_config('role', 'postgres', true);
  v := public.publish_page();
  perform set_config('role', r, true);
  return v;
exception when others then
  perform set_config('role', r, true);
  raise;
end $$;

create or replace function pg_temp.expect_fail(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — pernyataan seharusnya ditolak', p_label;
end $$;

-- Pernyataan HARUS mempengaruhi/mengembalikan tepat p_expected baris.
create or replace function pg_temp.expect_rows(p_sql text, p_expected bigint, p_label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  if n <> p_expected then
    raise exception 'FAIL: % — diharapkan % baris, dapat %', p_label, p_expected, n;
  end if;
  raise notice 'PASS: %', p_label;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  a_page uuid;
  a_item uuid;
  n bigint;
  pub jsonb;
begin
  -- Setup sebagai superuser: dua akun auth.
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a@example.test'),
    (b, 'authenticated', 'authenticated', 'b@example.test');

  -- === Pengguna A membuat data ===
  perform pg_temp.as_user(a);
  -- Phase 8: client tidak lagi boleh INSERT langsung ke profiles/pages; keduanya dibuat oleh claim_profile() (SECURITY DEFINER).
  perform public.claim_profile('alice', 'Alice');
  select id into a_page from public.pages where owner_id = a;
  update public.pages set draft_config = '{"theme":"porcelain"}' where id = a_page;
  insert into public.page_links (page_id, title, url) values (a_page, 'Rahasia draft A', 'https://example.test/a');
  insert into public.catalog_items (page_id, title) values (a_page, 'Item A') returning id into a_item;

  -- === Pengguna B ===
  perform pg_temp.as_user(b);
  perform public.claim_profile('bobby', 'Bob');

  perform pg_temp.expect_rows('select 1 from public.pages where id = ''' || a_page || '''', 0, 'B tidak bisa membaca page A');
  perform pg_temp.expect_rows('select 1 from public.page_links', 0, 'B tidak bisa membaca link draft A');
  perform pg_temp.expect_rows('select 1 from public.catalog_items', 0, 'B tidak bisa membaca katalog draft A');
  perform pg_temp.expect_rows('select 1 from public.profiles where id = ''' || a || '''', 0, 'B tidak bisa membaca profil A');

  -- UPDATE/DELETE ke baris milik A terfilter RLS => 0 baris terpengaruh, data A utuh.
  update public.pages set draft_config = '{"hacked":true}' where id = a_page;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B bisa mengubah draft A'; end if;
  delete from public.page_links;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B bisa menghapus link A'; end if;
  raise notice 'PASS: B tidak bisa mengubah/menghapus data A';

  -- INSERT dengan identitas palsu / ke milik A harus ditolak.
  perform pg_temp.expect_fail(
    format('insert into public.profiles (id, username) values (%L, %L)', a, 'spoofa'),
    'B tidak bisa membuat profil dengan id milik A (owner_id tidak dipercaya)');
  perform pg_temp.expect_fail(
    format('insert into public.pages (owner_id) values (%L)', a),
    'B tidak bisa membuat page atas nama A');
  perform pg_temp.expect_fail(
    format('insert into public.page_links (page_id, title, url) values (%L, %L, %L)', a_page, 'x', 'https://x.test'),
    'B tidak bisa menyisipkan link ke page A');
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, position, storage_path) values (%L, 0, %L)', a_item, 'x'),
    'B tidak bisa menyisipkan gambar ke item A');

  -- B tidak bisa memaksa status publikasi lewat UPDATE langsung.
  perform pg_temp.expect_fail('update public.pages set is_published = true',
    'B tidak bisa set is_published langsung (hanya via publish_page)');
  perform pg_temp.expect_fail('insert into public.published_snapshots (page_id, version, payload) select id, 1, ''{}'' from public.pages',
    'Tidak ada yang bisa menulis snapshot langsung');

  -- === Aturan username ===
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail(format('update public.profiles set username = %L where id = %L', 'login', a),
    'username reserved "login" ditolak');
  perform pg_temp.expect_fail(format('update public.profiles set username = %L where id = %L', 'bobby', a),
    'username duplikat ditolak');
  perform pg_temp.expect_fail(format('update public.profiles set username = %L where id = %L', 'Bad Name!', a),
    'format username tidak valid ditolak');

  -- === Batas 7 gambar per item ===
  -- (Phase 5: path gambar harus milik pemanggil dan objeknya harus ada di draft-assets)
  insert into storage.objects (bucket_id, name) select 'draft-assets', a || '/catalog/x' || g || '.webp' from generate_series(0, 7) g;
  insert into public.catalog_images (item_id, position, storage_path)
    select a_item, g, a || '/catalog/x' || g || '.webp' from generate_series(0, 6) g;
  perform pg_temp.expect_fail(
    format('insert into public.catalog_images (item_id, position, storage_path) values (%L, 7, %L)', a_item, a || '/catalog/x7.webp'),
    'gambar ke-8 ditolak');

  -- === Anon tidak punya akses langsung ke tabel ===
  perform pg_temp.as_anon();
  perform pg_temp.expect_fail('select * from public.pages', 'anon tidak bisa SELECT pages');
  perform pg_temp.expect_fail('select * from public.profiles', 'anon tidak bisa SELECT profiles');
  perform pg_temp.expect_fail('select * from public.published_snapshots', 'anon tidak bisa SELECT snapshots');
  perform pg_temp.expect_fail('select public.publish_page()', 'anon tidak bisa memanggil publish_page');

  -- === Publish / draft / unpublish ===
  -- Sebelum publish: tidak ada halaman publik.
  if public.get_public_page('alice') is not null then
    raise exception 'FAIL: halaman belum dipublish tetapi terbaca publik';
  end if;
  raise notice 'PASS: sebelum publish, get_public_page = null';

  -- Gambar belum punya salinan publik => publish harus gagal dan tidak mengubah apa pun.
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail('select pg_temp.publish_core()', 'publish ditolak bila aset belum dipublikasikan');
  perform pg_temp.expect_rows(format('select 1 from public.published_snapshots where page_id = %L', a_page), 0,
    'publish gagal => tidak ada snapshot setengah jadi');

  perform pg_temp.as_admin();  -- simulasi server mengisi path publik (client tidak boleh menulisnya)
  update public.catalog_images set published_path = 'pub/' || storage_path where item_id = a_item;
  perform pg_temp.as_user(a);
  if pg_temp.publish_core() <> 1 then raise exception 'FAIL: versi publish pertama harus 1'; end if;
  raise notice 'PASS: publish v1 berhasil';

  perform pg_temp.as_anon();
  pub := public.get_public_page('alice');
  if pub is null then raise exception 'FAIL: anon tidak bisa membaca halaman terbit'; end if;
  if pub::text like '%owner_id%' or pub::text like '%draft_path%' or pub::text like '%storage_path%' then
    raise exception 'FAIL: payload publik membocorkan field internal';
  end if;
  raise notice 'PASS: anon membaca snapshot publik tanpa field internal';

  -- Edit draft setelah publish TIDAK mengubah halaman live.
  perform pg_temp.as_user(a);
  update public.page_links set title = 'Draft baru' where page_id = a_page;
  perform pg_temp.as_anon();
  if public.get_public_page('alice')::text like '%Draft baru%' then
    raise exception 'FAIL: perubahan draft bocor ke halaman live';
  end if;
  raise notice 'PASS: edit draft tidak mengubah halaman live';

  -- Publish ke-2 yang GAGAL (aset baru belum punya salinan publik) tidak boleh merusak versi live v1.
  perform pg_temp.as_user(a);
  perform pg_temp.as_admin();
  update public.catalog_images set published_path = null where item_id = a_item and position = 0;
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail('select pg_temp.publish_core()', 'publish v2 gagal saat aset belum siap');
  perform pg_temp.as_anon();
  pub := public.get_public_page('alice');
  if pub is null or pub::text like '%Draft baru%' then
    raise exception 'FAIL: kegagalan publish merusak/menggantikan versi live sebelumnya';
  end if;
  raise notice 'PASS: publish gagal => versi live sebelumnya tetap tersedia';
  perform pg_temp.as_user(a);
  perform pg_temp.expect_rows(format('select 1 from public.published_snapshots where page_id = %L', a_page), 1,
    'publish gagal => tidak menambah snapshot baru');

  -- Unpublish menghentikan akses publik.
  perform pg_temp.as_user(a);
  perform public.unpublish_page();
  perform pg_temp.as_anon();
  if public.get_public_page('alice') is not null then
    raise exception 'FAIL: unpublish tidak menghentikan akses publik';
  end if;
  raise notice 'PASS: unpublish menghentikan akses publik';

  raise notice 'SEMUA TES ISOLASI LULUS';
end $$;

rollback;
