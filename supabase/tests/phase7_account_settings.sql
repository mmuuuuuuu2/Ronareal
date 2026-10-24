-- RONA — tes Phase 7: username (terbit, karantina, reserved, unik), SEO, profil parsial, isolasi dua akun, snapshot/status.
-- Jalankan setelah SEMUA migration. Postgres lokal + shim, BUKAN Supabase asli. Satu transaksi + ROLLBACK.
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

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a7';
  b uuid := '00000000-0000-0000-0000-0000000000b7';
  pa uuid; r jsonb; cfg jsonb; pub jsonb; st jsonb;
  prev int; srev int; seorev int; nsnap bigint; ver1 int;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a7@example.test'),
    (b, 'authenticated', 'authenticated', 'b7@example.test');
  perform pg_temp.as_user(a); pa := public.claim_profile('akun-a7', 'Akun A');
  perform pg_temp.as_user(b); perform public.claim_profile('akun-b7', 'Akun B');
  perform pg_temp.as_admin();
  insert into public.page_links (page_id, title, url) values (pa, 'Tautan A', 'https://a7.example');

  -- ============ username: validasi, reserved, unik, ketersediaan
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select public.change_username('akun-a7')$q$, 'B tidak bisa mengambil username A', '%username_taken%');
  perform pg_temp.expect_fail($q$select public.change_username('dashboard')$q$, 'username reserved ditolak', '%username_reserved%');
  perform pg_temp.expect_fail($q$select public.change_username('settings')$q$, 'rute /settings reserved', '%username_reserved%');
  perform pg_temp.expect_fail($q$select public.change_username('-salah')$q$, 'format salah ditolak', '%username_invalid%');
  perform pg_temp.ok(public.is_username_available('akun-a7') = false, 'is_username_available: nama terpakai = false');
  perform pg_temp.ok(public.is_username_available('nama-bebas-7') = true, 'is_username_available: nama bebas = true');
  perform pg_temp.as_anon();
  perform pg_temp.expect_fail($q$select public.change_username('anon-nama')$q$, 'anon tidak bisa change_username', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.save_seo('{}'::jsonb, 0)$q$, 'anon tidak bisa save_seo', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.update_profile_fields('{"bio":"x"}'::jsonb, 0)$q$, 'anon tidak bisa update_profile_fields', '%permission denied%');
  perform pg_temp.expect_fail($q$select * from public.username_released$q$, 'anon tidak membaca karantina', '%permission denied%');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select * from public.username_released$q$, 'pengguna tidak membaca tabel karantina', '%permission denied%');

  -- ============ terbit, lalu ganti username
  perform pg_temp.as_user(a);
  ver1 := public.publish_page_with_assets();
  pub := public.get_public_page('akun-a7');
  perform pg_temp.ok(pub #>> '{profile,username}' = 'akun-a7' and pub #>> '{profile,display_name}' = 'Akun A', 'halaman terbit di username awal');
  st := public.get_publish_state();
  perform pg_temp.ok((st ->> 'is_published')::boolean and (st ->> 'has_changes')::boolean = false, 'status: terbit, tanpa perubahan');
  select profile_rev into prev from public.profiles where id = a;

  perform pg_temp.ok(public.change_username('Nama-Baru-A7 ') = 'nama-baru-a7', 'ganti username saat terbit (dinormalisasi)');
  perform pg_temp.ok((select profile_rev from public.profiles where id = a) = prev + 1, 'profile_rev naik saat username berubah');
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('akun-a7') is null, 'URL lama: tidak ada halaman (404), tidak menampilkan data siapa pun');
  pub := public.get_public_page('nama-baru-a7');
  perform pg_temp.ok(pub is not null and pub #>> '{profile,username}' = 'nama-baru-a7', 'URL baru melayani halaman dengan username baru (snapshot ditimpa)');
  perform pg_temp.ok(pub #>> '{profile,display_name}' = 'Akun A' and jsonb_array_length(pub -> 'links') = 1, 'isi halaman tidak berubah/hilang');
  perform pg_temp.as_user(a);
  st := public.get_publish_state();
  perform pg_temp.ok((st ->> 'has_changes')::boolean = false, 'ganti username BUKAN perubahan belum terbit');
  perform pg_temp.ok((select count(*) from public.published_snapshots where page_id = pa) = 1, 'ganti username tidak membuat snapshot baru');
  perform pg_temp.ok((select draft_config from public.pages where owner_id = a) is not null, 'page config tetap ada');

  -- ============ karantina: nama lama tidak bisa langsung diambil orang lain
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select public.change_username('akun-a7')$q$, 'username lama A dikarantina bagi B', '%username_recently_released%');
  perform pg_temp.ok(public.is_username_available('akun-a7') = false, 'is_username_available: nama dikarantina = false bagi B');
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.is_username_available('akun-a7') = true, 'is_username_available: pemilik lama boleh');
  -- karantina kedaluwarsa -> bisa diambil
  perform pg_temp.as_admin();
  update public.username_released set released_at = now() - interval '31 days' where username = 'akun-a7';
  perform pg_temp.as_user(b);
  perform pg_temp.ok(public.change_username('akun-a7') = 'akun-a7', 'setelah karantina lewat, B boleh mengambilnya');
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('akun-a7') is null, 'B belum terbit: nama itu tidak menampilkan halaman apa pun');
  perform pg_temp.as_user(b);
  perform public.change_username('akun-b7');

  -- ============ SEO
  perform pg_temp.as_user(a);
  select seo_rev, settings_rev into seorev, srev from public.pages where owner_id = a;
  perform pg_temp.expect_fail($q$update public.pages set seo_rev = 9$q$, 'client tidak bisa menulis seo_rev', '%permission denied%');
  perform public.set_catalog_settings(true, 'Katalog A');
  r := public.save_draft(null, '{"radius":"sm"}'::jsonb, 0, srev);
  r := public.save_seo('{"title":"  Judul SEO  ","description":"Deskripsi","ogTitle":"","ogImage":"background","twitterCard":"summary_large_image"}'::jsonb, seorev);
  seorev := (r ->> 'seo_rev')::int;
  select draft_config into cfg from public.pages where owner_id = a;
  perform pg_temp.ok(cfg #>> '{seo,title}' = 'Judul SEO' and cfg #>> '{seo,ogImage}' = 'background' and not (cfg -> 'seo') ? 'ogTitle', 'SEO tersimpan (dipangkas, kosong dibuang)');
  perform pg_temp.ok(cfg #>> '{catalog,title}' = 'Katalog A' and cfg #>> '{settings,radius}' = 'sm', 'simpan SEO tidak menghapus katalog maupun tampilan');
  perform pg_temp.ok((select count(*) from public.page_links where page_id = pa) = 1, 'simpan SEO tidak menghapus link');
  -- simpan tampilan berikutnya tidak menghapus SEO
  select settings_rev into srev from public.pages where owner_id = a;
  r := public.save_draft(null, '{"radius":"lg"}'::jsonb, 0, srev);
  select draft_config into cfg from public.pages where owner_id = a;
  perform pg_temp.ok(cfg #>> '{seo,title}' = 'Judul SEO', 'simpan tampilan tidak menghapus SEO');
  -- konflik dua tab
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"title":"Tab basi"}'::jsonb, %s)$q$, seorev - 1), 'SEO: revisi basi = konflik', '%draft_conflict_seo%');
  perform pg_temp.ok((select draft_config #>> '{seo,title}' from public.pages where owner_id = a) = 'Judul SEO', 'konflik tidak menimpa data');
  -- validasi
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"title":"%s"}'::jsonb, %s)$q$, repeat('x', 71), seorev), 'judul SEO > 70 ditolak', '%seo_invalid%');
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"description":"%s"}'::jsonb, %s)$q$, repeat('x', 161), seorev), 'deskripsi > 160 ditolak', '%seo_invalid%');
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"ogImage":"http://evil.example/x.png"}'::jsonb, %s)$q$, seorev), 'og image URL bebas ditolak (hanya aset terbit)', '%seo_invalid%');
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"twitterCard":"player"}'::jsonb, %s)$q$, seorev), 'twitter card tak dikenal ditolak', '%seo_invalid%');
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"canonical":"https://evil.example"}'::jsonb, %s)$q$, seorev), 'canonical tidak bisa diatur client', '%seo_invalid%');
  perform pg_temp.expect_fail(format($q$select public.save_seo('{"title":"a\u0007b"}'::jsonb, %s)$q$, seorev), 'karakter kontrol ditolak', '%seo_invalid%');
  perform pg_temp.expect_fail($q$select public.save_seo('[]'::jsonb, 0)$q$, 'SEO bukan objek ditolak', '%seo_invalid%');

  -- SEO draft TIDAK mengubah halaman live sebelum Publish, tetapi tercatat sebagai perubahan belum terbit
  perform pg_temp.as_anon();
  pub := public.get_public_page('nama-baru-a7');
  perform pg_temp.ok(pub::text not like '%Judul SEO%' and pub::text not like '%seo%', 'SEO draft tidak bocor ke halaman live sebelum Publish');
  perform pg_temp.as_user(a);
  perform pg_temp.ok((public.get_publish_state() ->> 'has_changes')::boolean, 'SEO draft = ada perubahan belum terbit');
  perform public.publish_page_with_assets();
  perform pg_temp.as_anon();
  pub := public.get_public_page('nama-baru-a7');
  perform pg_temp.ok(pub #>> '{config,seo,title}' = 'Judul SEO', 'setelah Publish, SEO ada di snapshot publik');
  perform pg_temp.as_user(a);
  perform pg_temp.ok((public.get_publish_state() ->> 'has_changes')::boolean = false, 'setelah Publish: tanpa perubahan');

  -- unpublish: draft SEO tetap, halaman 404
  perform public.unpublish_page();
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('nama-baru-a7') is null, 'unpublish: halaman tidak lagi publik');
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select draft_config #>> '{seo,title}' from public.pages where owner_id = a) = 'Judul SEO', 'unpublish mempertahankan draft SEO');

  -- ============ update_profile_fields (parsial + revisi)
  select profile_rev into prev from public.profiles where id = a;
  r := public.update_profile_fields('{"displayName":"  Nama Baru  "}'::jsonb, prev);
  perform pg_temp.ok(r ->> 'display_name' = 'Nama Baru' and (r ->> 'profile_rev')::int = prev + 1, 'nama tampilan berubah, revisi naik');
  perform pg_temp.ok((select bio from public.profiles where id = a) is null, 'bio tidak disentuh');
  r := public.update_profile_fields('{"bio":"Bio saya"}'::jsonb, prev + 1);
  perform pg_temp.ok(r ->> 'bio' = 'Bio saya' and (select display_name from public.profiles where id = a) = 'Nama Baru', 'bio berubah, nama tetap');
  perform pg_temp.ok((select count(*) from public.page_links where page_id = pa) = 1
                     and (select draft_config #>> '{catalog,title}' from public.pages where owner_id = a) = 'Katalog A', 'ubah profil tidak menghapus link/katalog');
  perform pg_temp.expect_fail(format($q$select public.update_profile_fields('{"bio":"basi"}'::jsonb, %s)$q$, prev), 'profil: revisi basi = konflik', '%draft_conflict_profile%');
  perform pg_temp.expect_fail($q$select public.update_profile_fields('{"displayName":""}'::jsonb, 99)$q$, 'revisi salah ditolak lebih dulu', '%draft_conflict_profile%');
  select profile_rev into prev from public.profiles where id = a;
  perform pg_temp.expect_fail(format($q$select public.update_profile_fields('{"displayName":""}'::jsonb, %s)$q$, prev), 'nama kosong ditolak', '%draft_invalid%');
  perform pg_temp.expect_fail(format($q$select public.update_profile_fields('{"username":"x-hack"}'::jsonb, %s)$q$, prev), 'username tidak bisa lewat update_profile_fields', '%draft_invalid%');
  perform pg_temp.expect_fail(format($q$select public.update_profile_fields('{"bio":"%s"}'::jsonb, %s)$q$, repeat('x', 501), prev), 'bio > 500 ditolak', '%draft_invalid%');
  perform pg_temp.expect_fail(format($q$select public.update_profile_fields('{}'::jsonb, %s)$q$, prev), 'patch kosong ditolak', '%draft_nothing_to_save%');

  -- ============ tab editor basi tidak boleh mengembalikan username lama
  select profile_rev into prev from public.profiles where id = a;
  perform public.change_username('nama-lain-a7');
  perform pg_temp.expect_fail(
    format($q$select public.save_draft('{"displayName":"Basi","bio":"","username":"nama-baru-a7"}'::jsonb, null, %s, 0)$q$, prev),
    'editor basi tidak bisa mengembalikan username lama (draft_conflict_profile)', '%draft_conflict_profile%');
  perform pg_temp.ok((select username from public.profiles where id = a) = 'nama-lain-a7', 'username tetap yang terbaru');

  -- ============ isolasi dua akun
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.pages where owner_id = a) = 0, 'B tidak membaca page A');
  select seo_rev into seorev from public.pages where owner_id = b;
  r := public.save_seo('{"title":"Judul B"}'::jsonb, seorev);
  perform pg_temp.ok(r #>> '{seo,title}' = 'Judul B', 'B menyimpan SEO miliknya sendiri');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select draft_config #>> '{seo,title}' from public.pages where owner_id = a) = 'Judul SEO', 'save_seo B tidak menyentuh SEO A');
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Nama Baru', 'perubahan B tidak menyentuh profil A');

  raise notice 'SELESAI: tes Phase 7 lulus';
end $$;

rollback;
