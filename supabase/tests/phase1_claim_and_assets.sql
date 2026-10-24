-- RONA — tes Phase 1: klaim username, validasi aset saat publish, policy storage A vs B.
-- Jalankan setelah SEMUA migration diterapkan (lihat scripts/test-db.sh). Berjalan dalam transaksi + ROLLBACK.
-- Catatan: pada Postgres+shim, tabel storage.objects hanyalah stub; policy diuji, tetapi perilaku
-- API Storage Supabase asli (upload via HTTP) tetap harus diuji di proyek Supabase sebenarnya.

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

create or replace function pg_temp.expect_fail(p_sql text, p_label text, p_msg_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_msg_like is not null and sqlerrm not like p_msg_like then
      raise exception 'FAIL: % — ditolak, tetapi dengan pesan tak terduga: %', p_label, sqlerrm;
    end if;
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — seharusnya ditolak', p_label;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b1';
  a_page uuid;
  n bigint;
  ok boolean;
  pub jsonb;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a1@example.test'),
    (b, 'authenticated', 'authenticated', 'b1@example.test');

  ------------------------------------------------------------------ klaim username
  perform pg_temp.as_user(a);
  a_page := public.claim_username('  Alice-One ');
  if a_page is null then raise exception 'FAIL: claim_username tidak mengembalikan id page'; end if;
  select count(*) into n from public.profiles where id = a and username = 'alice-one';
  if n <> 1 then raise exception 'FAIL: username tidak dinormalisasi (trim+lowercase)'; end if;
  select count(*) into n from public.pages where owner_id = a and id = a_page;
  if n <> 1 then raise exception 'FAIL: page tidak dibuat bersama profil'; end if;
  raise notice 'PASS: claim_username membuat profil + page atomik, username ternormalisasi';

  perform pg_temp.expect_fail($q$select public.claim_username('another-name')$q$,
    'klaim kedua oleh pengguna yang sama ditolak', '%profile_exists%');

  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select public.claim_username('alice-one')$q$,
    'username yang sudah dipakai ditolak', '%username_taken%');
  perform pg_temp.expect_fail($q$select public.claim_username('login')$q$,
    'username reserved ditolak lewat claim', '%username_reserved%');
  perform pg_temp.expect_fail($q$select public.claim_username('a')$q$,
    'username terlalu pendek ditolak', '%username_invalid%');
  perform pg_temp.expect_fail($q$select public.claim_username('bad name!')$q$,
    'username berformat salah ditolak', '%username_invalid%');
  -- Kegagalan klaim tidak boleh meninggalkan profil setengah jadi.
  select count(*) into n from public.profiles where id = b;
  if n <> 0 then raise exception 'FAIL: klaim gagal tetapi profil B terbuat'; end if;
  raise notice 'PASS: klaim gagal tidak meninggalkan profil setengah jadi';
  perform public.claim_username('bobby-two');

  perform pg_temp.as_anon();
  perform pg_temp.expect_fail($q$select public.claim_username('anon-try')$q$, 'anon tidak bisa claim_username');
  perform pg_temp.expect_fail($q$select public.is_username_available('alice-one')$q$, 'anon tidak bisa menebak username (Phase 8: hak EXECUTE dicabut dari anon)');
  perform pg_temp.as_user(b);
  if public.is_username_available('alice-one') then raise exception 'FAIL: username terpakai dilaporkan tersedia'; end if;
  if public.is_username_available('login') then raise exception 'FAIL: reserved dilaporkan tersedia'; end if;
  if public.is_username_available('A!') then raise exception 'FAIL: format salah dilaporkan tersedia'; end if;
  if not public.is_username_available('free-name-9') then raise exception 'FAIL: username bebas dilaporkan tidak tersedia'; end if;
  raise notice 'PASS: is_username_available benar untuk terpakai/reserved/invalid/bebas (pengguna masuk; anon ditolak sejak Phase 8)';

  ------------------------------------------------------------------ aset saat publish
  perform pg_temp.as_user(a);
  update public.profiles set avatar_path = a || '/avatar/me.png' where id = a;
  update public.pages set background_path = a || '/background/bg.webp' where owner_id = a;
  perform pg_temp.expect_fail($q$select pg_temp.publish_core()$q$,
    'publish ditolak: avatar belum punya salinan publik', '%assets_not_published%');

  perform pg_temp.as_admin();  -- simulasi server mengisi *_published_path setelah menyalin file
  update public.profiles set avatar_published_path = a || '/avatar/me.png' where id = a;
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail($q$select pg_temp.publish_core()$q$,
    'publish ditolak: background belum punya salinan publik', '%assets_not_published%');

  -- Client tidak boleh mengisi background_published_path sendiri.
  perform pg_temp.expect_fail($q$update public.pages set background_published_path = 'x'$q$,
    'client tidak bisa menulis background_published_path');

  perform pg_temp.as_admin();
  update public.pages set background_published_path = a || '/background/bg.webp' where owner_id = a;
  perform pg_temp.as_user(a);
  if pg_temp.publish_core() <> 1 then raise exception 'FAIL: publish v1 setelah semua aset siap'; end if;
  perform pg_temp.as_anon();
  pub := public.get_public_page('alice-one');
  if pub is null or pub->>'background_path' is distinct from (a || '/background/bg.webp')
     or pub->'profile'->>'avatar_path' is distinct from (a || '/avatar/me.png') then
    raise exception 'FAIL: payload publik tidak memuat avatar/background terbit';
  end if;
  if pub::text like '%"background_path": null%' then raise exception 'FAIL: background null di payload'; end if;
  raise notice 'PASS: publish menyertakan avatar & background terbit; hanya path publik yang muncul';

  ------------------------------------------------------------------ storage policies
  perform pg_temp.as_user(a);
  insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/avatar/me.png');
  insert into storage.objects (bucket_id, name) values ('draft-assets', a || '/catalog/item-1_cover.webp');
  insert into storage.objects (bucket_id, name) values ('public-assets', a || '/avatar/me.png');
  raise notice 'PASS: A bisa menulis ke folder & struktur path miliknya (draft dan public)';

  perform pg_temp.expect_fail(format($q$insert into storage.objects (bucket_id, name) values ('draft-assets', %L)$q$, b || '/avatar/me.png'),
    'A tidak bisa menulis ke folder B (draft)');
  perform pg_temp.expect_fail(format($q$insert into storage.objects (bucket_id, name) values ('public-assets', %L)$q$, b || '/avatar/me.png'),
    'A tidak bisa menulis ke folder B (public)');
  perform pg_temp.expect_fail(format($q$insert into storage.objects (bucket_id, name) values ('draft-assets', %L)$q$, a || '/misc/x.png'),
    'jenis aset di luar avatar/background/link/catalog ditolak');
  perform pg_temp.expect_fail(format($q$insert into storage.objects (bucket_id, name) values ('draft-assets', %L)$q$, a || '/avatar/x.gif'),
    'ekstensi di luar jpg/jpeg/png/webp ditolak');
  perform pg_temp.expect_fail(format($q$insert into storage.objects (bucket_id, name) values ('draft-assets', %L)$q$, a || '/avatar/x.svg'),
    'SVG ditolak');
  perform pg_temp.expect_fail(format($q$insert into storage.objects (bucket_id, name) values ('draft-assets', %L)$q$, a || '/avatar/sub/x.png'),
    'subfolder tambahan / path traversal ditolak');
  perform pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values ('draft-assets', 'avatar/x.png')$q$,
    'objek tanpa folder uid ditolak');

  perform pg_temp.as_user(b);
  select count(*) into n from storage.objects where bucket_id = 'draft-assets';
  if n <> 0 then raise exception 'FAIL: B bisa melihat objek draft A (% baris)', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'public-assets';
  if n <> 0 then raise exception 'FAIL: B bisa mengenumerasi objek public-assets A (% baris)', n; end if;
  delete from storage.objects where bucket_id in ('draft-assets', 'public-assets');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B bisa menghapus objek A'; end if;
  raise notice 'PASS: B tidak bisa melihat, mengenumerasi, atau menghapus objek A';

  perform pg_temp.as_anon();
  begin
    select count(*) into n from storage.objects where bucket_id = 'draft-assets';
    if n <> 0 then raise exception 'FAIL: anon melihat objek draft'; end if;
  exception when insufficient_privilege then
    null;  -- di shim anon tidak punya grant; di Supabase asli RLS menghasilkan 0 baris. Keduanya aman.
  end;
  raise notice 'PASS: anon tidak melihat objek draft';

  perform pg_temp.as_user(a);
  delete from storage.objects where bucket_id = 'draft-assets' and name = a || '/avatar/me.png';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A tidak bisa menghapus objek miliknya'; end if;
  raise notice 'PASS: A bisa menghapus objek miliknya';

  raise notice 'SEMUA TES PHASE 1 LULUS';
end $$;

rollback;
