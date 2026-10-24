-- RONA — tes Phase 6: save_draft (optimistic concurrency + merge parsial) vs konfigurasi katalog dan published snapshot.
-- Jalankan setelah SEMUA migration. Berjalan pada Postgres lokal + shim, BUKAN Supabase asli. Satu transaksi + ROLLBACK.

begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('role', 'authenticated', true);
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
  a uuid := '00000000-0000-0000-0000-0000000000a6';
  b uuid := '00000000-0000-0000-0000-0000000000b6';
  pa uuid; r jsonb; cfg jsonb; pub jsonb; v1 jsonb;
  prev int; srev int; nsnap bigint;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a6@example.test'),
    (b, 'authenticated', 'authenticated', 'b6@example.test');
  perform pg_temp.as_user(a); pa := public.claim_profile('draft-a', 'Akun A');
  perform pg_temp.as_user(b); perform public.claim_profile('draft-b', 'Akun B');
  perform pg_temp.as_user(a);
  select profile_rev into prev from public.profiles where id = a;
  select settings_rev into srev from public.pages where owner_id = a;
  perform pg_temp.ok(prev = 0 and srev = 0, 'revisi awal 0 untuk profil dan tampilan');

  -- ============ grant: client tidak dapat menulis revisi langsung
  perform pg_temp.expect_fail($q$update public.pages set settings_rev = 99$q$, 'client tidak bisa menulis settings_rev', '%permission denied%');
  perform pg_temp.expect_fail($q$update public.profiles set profile_rev = 99$q$, 'client tidak bisa menulis profile_rev', '%permission denied%');
  perform pg_temp.expect_fail($q$select public.save_draft(null, null, 0, 0)$q$, 'save_draft tanpa data ditolak', '%draft_nothing_to_save%');

  -- ============ TES 1: perubahan profil tidak menghapus perubahan katalog
  perform public.set_catalog_settings(true, 'Portofolio');
  r := public.save_draft('{"displayName":"Nama Baru","bio":"Bio baru","username":"draft-a"}'::jsonb, null, prev, srev);
  prev := (r ->> 'profile_rev')::int;
  select draft_config into cfg from public.pages where owner_id = a;
  perform pg_temp.ok(cfg #>> '{catalog,title}' = 'Portofolio' and (cfg #>> '{catalog,enabled}') = 'true',
    '[1] simpan profil tidak menghapus konfigurasi katalog');
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Nama Baru' and prev = 1, '[1] profil tersimpan, revisi profil naik');
  perform pg_temp.ok((select settings_rev from public.pages where owner_id = a) = 0, '[1] revisi tampilan tidak ikut naik (grup tidak dikirim)');

  -- ============ TES 1b: simpan tampilan juga tidak menghapus katalog (merge parsial, kunci lain tetap)
  r := public.save_draft(null, '{"radius":"sm","accentColor":"#B5A58D"}'::jsonb, prev, srev);
  srev := (r ->> 'settings_rev')::int;
  select draft_config into cfg from public.pages where owner_id = a;
  perform pg_temp.ok(cfg #>> '{settings,radius}' = 'sm' and (cfg ->> 'version')::int = 1, '[1b] tampilan tersimpan');
  perform pg_temp.ok(cfg #>> '{catalog,title}' = 'Portofolio', '[1b] simpan tampilan tidak menghapus katalog');
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Nama Baru', '[1b] simpan tampilan tidak menimpa profil');

  -- ============ TES 2: perubahan katalog tidak menghapus perubahan profil/tampilan
  perform public.set_catalog_settings(false, 'Karya');
  select draft_config into cfg from public.pages where owner_id = a;
  perform pg_temp.ok(cfg #>> '{settings,radius}' = 'sm' and cfg #>> '{catalog,title}' = 'Karya', '[2] ubah katalog tidak menghapus tampilan');
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Nama Baru' and (select bio from public.profiles where id = a) = 'Bio baru',
    '[2] ubah katalog tidak menghapus profil');
  perform pg_temp.ok((select settings_rev from public.pages where owner_id = a) = srev, '[2] ubah katalog tidak mengubah revisi tampilan (bukan konflik palsu)');

  -- ============ TES 3: update bersamaan tidak diam-diam menimpa (tab kedua memakai revisi lama)
  -- Tab T1 dan T2 sama-sama memuat revisi (prev, srev). T1 menyimpan dulu.
  r := public.save_draft('{"displayName":"Dari Tab 1","bio":"","username":"draft-a"}'::jsonb, null, prev, srev);
  perform pg_temp.ok((r ->> 'profile_rev')::int = prev + 1, '[3] tab 1 berhasil menyimpan profil');
  -- Tab 2 (revisi lama) mencoba menyimpan profil: DITOLAK, data tab 1 utuh.
  perform pg_temp.expect_fail(
    format($q$select public.save_draft('{"displayName":"Dari Tab 2","bio":"x","username":"draft-a"}'::jsonb, null, %s, %s)$q$, prev, srev),
    '[3] simpan profil dengan revisi usang ditolak', '%draft_conflict_profile%');
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Dari Tab 1', '[3] perubahan terbaru tidak tertimpa');
  prev := prev + 1;
  -- Tampilan: tab 2 menyimpan dengan revisi usang setelah tab 1 menyimpan tampilan.
  r := public.save_draft(null, '{"radius":"md"}'::jsonb, prev, srev);
  perform pg_temp.expect_fail(
    format($q$select public.save_draft(null, '{"radius":"pill"}'::jsonb, %s, %s)$q$, prev, srev),
    '[3] simpan tampilan dengan revisi usang ditolak', '%draft_conflict_settings%');
  select draft_config into cfg from public.pages where owner_id = a;
  perform pg_temp.ok(cfg #>> '{settings,radius}' = 'md', '[3] tampilan terbaru tidak tertimpa');
  srev := (r ->> 'settings_rev')::int;
  -- Grup yang tidak dikirim tidak diperiksa: tab yang hanya mengubah tampilan tidak terkena konflik karena profil usang.
  r := public.save_draft(null, '{"radius":"lg"}'::jsonb, prev - 1, srev);
  srev := (r ->> 'settings_rev')::int;
  perform pg_temp.ok(true, '[3] revisi profil usang tidak menghalangi simpan tampilan saja');

  -- ============ TES 4: kegagalan menyimpan bersifat atomik (tidak ada yang separuh tertulis)
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(
    format($q$select public.save_draft('{"displayName":"Lolos?","bio":"b","username":"draft-a"}'::jsonb, '{"radius":"sm"}'::jsonb, 0, 0)$q$),
    '[4] username dipakai akun lain: seluruh simpan ditolak', '%username_taken%');
  perform pg_temp.ok((select display_name from public.profiles where id = b) = 'Akun B', '[4] profil B tidak berubah saat simpan gagal');
  perform pg_temp.ok((select draft_config #>> '{settings,radius}' from public.pages where owner_id = b) is null, '[4] tampilan B tidak berubah saat simpan gagal');
  perform pg_temp.ok((select profile_rev from public.profiles where id = b) = 0 and (select settings_rev from public.pages where owner_id = b) = 0,
    '[4] revisi tidak naik saat gagal');
  perform pg_temp.expect_fail($q$select public.save_draft('{"displayName":"","bio":"","username":"draft-b"}'::jsonb, null, 0, 0)$q$, '[4] nama kosong ditolak', '%draft_invalid%');
  perform pg_temp.expect_fail($q$select public.save_draft(null, '"bukan objek"'::jsonb, 0, 0)$q$, '[4] pengaturan bukan objek ditolak', '%draft_invalid%');

  -- ============ Isolasi: B tidak dapat mengubah draft A (save_draft selalu memakai auth.uid())
  perform pg_temp.as_user(b);
  r := public.save_draft('{"displayName":"B Saja","bio":"","username":"draft-b"}'::jsonb, null, 0, 0);
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Dari Tab 1', 'isolasi: simpan B tidak mengubah profil A');
  perform pg_temp.expect_fail($q$select public.save_draft(null, '{"radius":"sm"}'::jsonb, 0, 0)$q$, 'revisi usang A tetap ditolak setelah aktivitas B', '%draft_conflict_settings%');

  -- ============ TES 5: published snapshot tetap utuh ketika simpan draft gagal (dan ketika berhasil)
  insert into public.page_links (page_id, title, url) values (pa, 'Satu', 'https://satu.example');
  perform public.publish_page_with_assets();
  select public.get_public_page('draft-a') into v1;
  perform pg_temp.ok(v1 is not null and (v1 ->> 'version')::int = 1, '[5] halaman terbit v1');
  select count(*) into nsnap from public.published_snapshots where page_id = pa;
  perform pg_temp.expect_fail(
    format($q$select public.save_draft('{"displayName":"Tidak Boleh","bio":"","username":"draft-b"}'::jsonb, '{"radius":"sm"}'::jsonb, %s, %s)$q$, prev, srev),
    '[5] simpan draft gagal (username dipakai)', '%username%');
  perform pg_temp.expect_fail(
    format($q$select public.save_draft(null, '{"radius":"sm"}'::jsonb, %s, %s)$q$, prev, srev - 1),
    '[5] simpan draft konflik', '%draft_conflict_settings%');
  pub := public.get_public_page('draft-a');
  perform pg_temp.ok(pub = v1, '[5] snapshot terbit identik setelah simpan draft gagal');
  perform pg_temp.ok((select count(*) from public.published_snapshots where page_id = pa) = nsnap, '[5] tidak ada snapshot baru');
  -- Simpan draft BERHASIL pun tidak mengubah halaman live sebelum Publish.
  r := public.save_draft('{"displayName":"Draft Baru","bio":"","username":"draft-a"}'::jsonb, '{"radius":"sm"}'::jsonb, prev, srev);
  pub := public.get_public_page('draft-a');
  perform pg_temp.ok(pub = v1 and pub::text not like '%Draft Baru%', '[5] simpan draft berhasil tidak mengubah halaman live sebelum Publish');
  -- Phase 7: username boleh diganti saat terbit (kunci Phase 3 dicabut). Simpan tetap atomik; lalu dikembalikan.
  r := public.save_draft('{"displayName":"Draft Baru","bio":"","username":"nama-baru-a"}'::jsonb, null, (r ->> 'profile_rev')::int, (r ->> 'settings_rev')::int);
  perform pg_temp.ok(r ->> 'username' = 'nama-baru-a', '[5] ganti username saat terbit diizinkan (Phase 7)');
  perform pg_temp.ok(public.change_username('draft-a') = 'draft-a', '[5] username dikembalikan');
  select profile_rev into prev from public.profiles where id = a;
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Draft Baru', '[5] profil tersimpan utuh');
  -- Publish berikutnya memuat draft terbaru (mekanisme Phase 4 tidak berubah).
  perform public.publish_page_with_assets();
  perform pg_temp.ok(public.get_public_page('draft-a')::text like '%Draft Baru%', '[5] publish ulang memuat draft terbaru');
  perform pg_temp.ok((public.get_public_page('draft-a') ->> 'version')::int = 2, '[5] publish ulang = versi 2');

  raise notice 'SELESAI: tes Phase 6 draft save lulus';
end $$;

rollback;
