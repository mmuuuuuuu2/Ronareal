-- RONA — tes integrasi Phase 8 (SQL): alur A–D lintas fase pada Postgres lokal + shim (BUKAN Supabase asli).
-- A: daftar -> klaim -> profil/link/katalog/draft -> terbit -> pengunjung anon. B: ubah draft/SEO tidak mengubah live sebelum
-- publish; publish gagal aman. C: unpublish/republish. D: isolasi dua akun + hardening hak akses. Satu transaksi + ROLLBACK.
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
  a uuid := '00000000-0000-0000-0000-0000000000a8';
  b uuid := '00000000-0000-0000-0000-0000000000b8';
  pa uuid; pb uuid; la uuid; ia uuid; r jsonb; pub jsonb; v1 jsonb; st jsonb; ver int; nsnap int;
  av text := '00000000-0000-0000-0000-0000000000a8/avatar/a8.png';
  bav text := '00000000-0000-0000-0000-0000000000b8/avatar/b8.png';
  prev int; srev int; seorev int;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a8@example.test'),
    (b, 'authenticated', 'authenticated', 'b8@example.test');

  -- ================= A. registrasi sampai halaman publik
  perform pg_temp.as_user(a);
  perform public.claim_profile('integrasi-a', 'Akun A');
  select id into pa from public.pages where owner_id = a;
  perform pg_temp.ok(pa is not null, 'A1 onboarding membuat profil + halaman (atomik)');
  select profile_rev, settings_rev, seo_rev into prev, srev, seorev from public.profiles pr, public.pages pg where pr.id = a and pg.owner_id = a;
  r := public.update_profile_fields('{"bio":"Bio A"}'::jsonb, prev);
  insert into public.page_links (page_id, title, url) values (pa, 'Tautan A', 'https://a8.example') returning id into la;
  perform public.set_catalog_settings(true, 'Layanan');
  insert into public.catalog_items (page_id, title, summary) values (pa, 'Paket A', 'Ringkas') returning id into ia;
  r := public.save_draft(null, '{"radius":"sm"}'::jsonb, 0, srev);
  r := public.save_seo('{"title":"SEO A"}'::jsonb, seorev);
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('integrasi-a') is null, 'A2 sebelum terbit: pengunjung tidak melihat apa pun (draft tidak bocor)');
  perform pg_temp.as_user(a);
  ver := public.publish_page_with_assets();
  perform pg_temp.as_anon();
  pub := public.get_public_page('integrasi-a'); v1 := pub;
  perform pg_temp.ok(pub #>> '{profile,display_name}' = 'Akun A' and pub #>> '{profile,bio}' = 'Bio A'
    and pub #>> '{links,0,title}' = 'Tautan A' and pub #>> '{catalog,0,title}' = 'Paket A'
    and pub #>> '{config,seo,title}' = 'SEO A' and pub #>> '{config,settings,radius}' = 'sm', 'A3 pengunjung anon melihat snapshot lengkap (profil, link, katalog, SEO, tampilan)');
  perform pg_temp.ok(pub::text not like '%draft-assets%' and pub::text not like '%signed%' and pub::text not like '%token%', 'A4 snapshot tanpa path draft/signed URL/token');

  -- ================= B. ubah draft -> live tidak berubah -> publish -> live baru
  perform pg_temp.as_user(a);
  select profile_rev, settings_rev, seo_rev into prev, srev, seorev from public.profiles pr, public.pages pg where pr.id = a and pg.owner_id = a;
  r := public.update_profile_fields('{"displayName":"Akun A Baru"}'::jsonb, prev);
  update public.page_links set title = 'Tautan A2' where id = la;
  update public.catalog_items set title = 'Paket A2' where id = ia;
  r := public.save_seo('{"title":"SEO A2"}'::jsonb, seorev);
  st := public.get_publish_state();
  perform pg_temp.ok((st ->> 'is_published')::boolean and (st ->> 'has_changes')::boolean, 'B1 status: terbit + ada perubahan belum terbit');
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('integrasi-a') = v1, 'B2 halaman publik IDENTIK sebelum publish (profil/link/katalog/SEO diubah)');
  -- publish gagal: avatar draft tanpa salinan publik => ditolak, live lama utuh, tidak ada snapshot setengah jadi
  perform pg_temp.as_admin();
  update public.profiles set avatar_path = av where id = a;
  select count(*) into nsnap from public.published_snapshots where page_id = pa;
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail($q$select public.publish_page_with_assets()$q$, 'B3 publish gagal (aset belum ada) ditolak', '%assets_not_published%');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select count(*) from public.published_snapshots where page_id = pa) = nsnap, 'B4 tidak ada snapshot setengah jadi');
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('integrasi-a') = v1, 'B5 versi live sebelumnya tetap utuh setelah gagal');
  perform pg_temp.as_admin();
  insert into storage.objects (bucket_id, name, owner) values ('public-assets', av, a);
  perform pg_temp.as_user(a);
  ver := public.publish_page_with_assets(av);
  perform pg_temp.as_anon();
  pub := public.get_public_page('integrasi-a');
  perform pg_temp.ok(pub #>> '{profile,display_name}' = 'Akun A Baru' and pub #>> '{links,0,title}' = 'Tautan A2'
    and pub #>> '{catalog,0,title}' = 'Paket A2' and pub #>> '{config,seo,title}' = 'SEO A2' and pub #>> '{profile,avatar_path}' = av,
    'B6 setelah publish: live menampilkan versi terbaru');

  -- ================= C. unpublish / republish
  perform pg_temp.as_user(a);
  perform public.unpublish_page();
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('integrasi-a') is null, 'C1 unpublish: pengunjung tidak mendapat halaman (404)');
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select title from public.page_links where id = la) = 'Tautan A2'
    and (select draft_config #>> '{seo,title}' from public.pages where owner_id = a) = 'SEO A2', 'C2 draft tetap utuh setelah unpublish');
  update public.page_links set title = 'Tautan A3' where id = la;
  ver := public.publish_page_with_assets(av);
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('integrasi-a') #>> '{links,0,title}' = 'Tautan A3', 'C3 republish: URL publik kembali dengan snapshot terbaru');

  -- ================= D. isolasi dua akun + hardening
  perform pg_temp.as_user(b);
  perform public.claim_profile('integrasi-b', 'Akun B');
  select id into pb from public.pages where owner_id = b;
  perform pg_temp.ok((select count(*) from public.page_links where id = la) = 0, 'D1 B tidak membaca link A');
  update public.page_links set title = 'diretas' where id = la;
  perform pg_temp.ok((select title from (select title from public.page_links where id = la) q) is null, 'D2 B tidak melihat/mengubah link A');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select title from public.page_links where id = la) = 'Tautan A3' and (select title from public.catalog_items where id = ia) = 'Paket A2', 'D3 data A utuh setelah upaya B');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(format('insert into public.catalog_items (page_id, title) values (%L, %L)', pa, 'sisip'), 'D4 B tidak bisa menambah item ke katalog A');
  perform pg_temp.expect_fail(format('insert into public.page_links (page_id, title, url) values (%L, %L, %L)', pa, 'x', 'https://x.example'), 'D5 B tidak bisa menambah link ke halaman A');
  perform pg_temp.expect_fail(format('update public.profiles set avatar_path = %L where id = %L', av, b), 'D6 B tidak bisa memalsukan path avatar milik A', '%image_path_invalid%');
  perform pg_temp.as_admin();
  insert into public.page_links (page_id, title, url) values (pb, 'Tautan B', 'https://b8.example');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(format('select public.publish_page_with_assets(%L)', av), 'D7 B tidak bisa menerbitkan memakai aset A', '%assets_invalid%');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail($q$select public.change_username('integrasi-a')$q$, 'D9 username tidak dapat diklaim ganda', '%username_taken%');
  perform pg_temp.expect_fail($q$select public.publish_page()$q$, 'D10 publish_page() tidak dapat dipanggil client', '%permission denied%');
  perform pg_temp.as_anon();
  perform pg_temp.ok(public.get_public_page('integrasi-b') is null, 'D11 halaman B (belum terbit) tidak membocorkan draft');
  perform pg_temp.ok(public.get_public_page('integrasi-a') #>> '{profile,display_name}' = 'Akun A Baru', 'D12 halaman A tidak tercampur data B');
  perform pg_temp.ok(public.get_public_page('integrasi-b') is null and public.get_public_page('INTEGRASI-A') is not null, 'D13 pencarian username tidak peka huruf besar, tidak lintas akun');

  -- hardening Phase 8
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail($q$delete from public.pages$q$, 'H1 client tidak bisa menghapus halaman lewat API', '%permission denied%');
  perform pg_temp.expect_fail(format('insert into public.pages (owner_id, is_published) values (%L, true)', b), 'H2 client tidak bisa menyisipkan baris pages (is_published palsu)', '%permission denied%');
  perform pg_temp.expect_fail($q$delete from public.profiles$q$, 'H3 client tidak bisa menghapus profil', '%permission denied%');
  perform pg_temp.expect_fail($q$truncate public.page_links$q$, 'H4 client tidak bisa TRUNCATE (tidak tunduk RLS)', '%permission denied%');
  perform pg_temp.expect_fail($q$truncate public.published_snapshots$q$, 'H5 TRUNCATE snapshot ditolak', '%permission denied%');
  perform pg_temp.as_anon();
  perform pg_temp.expect_fail($q$select public.is_username_available('apa-saja')$q$, 'H6 anon tidak bisa menebak username', '%permission denied%');
  perform pg_temp.expect_fail($q$select * from public.pages$q$, 'H7 anon tidak membaca pages', '%permission denied%');
  perform pg_temp.expect_fail($q$select * from public.published_snapshots$q$, 'H8 anon tidak membaca snapshot langsung', '%permission denied%');

  perform pg_temp.as_admin();
  raise notice 'SELESAI: tes integrasi Phase 8 lulus';
end $$;

rollback;
