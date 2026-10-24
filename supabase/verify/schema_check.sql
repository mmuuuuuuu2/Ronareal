-- RONA — PEMERIKSAAN SKEMA (hanya SELECT; tidak mengubah apa pun).
-- Jalankan di SQL Editor proyek Supabase UJI SETELAH migration 1–9 diterapkan (lihat docs/supabase-test-project-verification.md).
-- Hasil: satu baris per pemeriksaan; kolom ok harus true semua. Baris ok=false = penyimpangan dari skema yang ditargetkan.
with
tabel(t) as (values ('profiles'),('pages'),('page_links'),('catalog_items'),('catalog_images'),
                    ('published_snapshots'),('reserved_usernames'),('username_released')),
fn_definer as (   -- semua fungsi SECURITY DEFINER di schema public
  select p.oid, p.proname, p.proconfig, p.proargtypes::regtype[]::text as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
)
select 'RLS aktif: ' || t as pemeriksaan,
       coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t)), false) as ok
from tabel
union all
select 'username_released: RLS aktif & TANPA policy',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.username_released')), false)
       and not exists (select 1 from pg_policies where schemaname='public' and tablename='username_released')
union all
select 'Kolom revisi ada: ' || x.tbl || '.' || x.col,
       exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=x.tbl and c.column_name=x.col)
from (values ('profiles','profile_rev'),('pages','settings_rev'),('pages','seo_rev')) as x(tbl,col)
union all
select 'Fungsi SECURITY DEFINER dengan search_path kosong: ' || proname || '(' || args || ')',
       coalesce(proconfig @> array['search_path=""'], false) or coalesce(proconfig @> array['search_path='], false)
from fn_definer
union all
select 'Fungsi RPC ada: ' || f,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f)
from unnest(array['claim_profile','claim_username','change_username','is_username_available','get_public_page',
  'get_publish_state','publish_page_with_assets','unpublish_page','publish_page','build_draft_payload','build_catalog_payload',
  'reorder_links','reorder_catalog_items','reorder_catalog_images','set_catalog_cover','set_catalog_settings',
  'save_draft','save_seo','update_profile_fields']) as f
union all
select 'publish_page TIDAK dapat dipanggil anon/authenticated',
       not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='publish_page'
union all
select 'is_username_available TIDAK dapat dipanggil anon (migration 9)',
       not has_function_privilege('anon', 'public.is_username_available(text)'::regprocedure, 'execute')
union all
select 'get_public_page dapat dipanggil anon (halaman publik)',
       has_function_privilege('anon', 'public.get_public_page(text)'::regprocedure, 'execute')
union all
select 'Tidak ada hak TRUNCATE/REFERENCES/TRIGGER untuk anon/authenticated di tabel public (migration 9)',
       not exists (
         select 1 from information_schema.role_table_grants g
         where g.table_schema='public' and g.grantee in ('anon','authenticated')
           and g.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER'))
union all
select 'authenticated TIDAK punya INSERT/DELETE langsung pada ' || t || ' (migration 9)',
       not exists (select 1 from information_schema.role_table_grants g
                   where g.table_schema='public' and g.table_name=t and g.grantee='authenticated'
                     and g.privilege_type in ('INSERT','DELETE'))
from unnest(array['pages','profiles']) as t
union all
select 'anon tidak punya hak tulis di tabel public apa pun',
       not exists (select 1 from information_schema.role_table_grants g
                   where g.table_schema='public' and g.grantee='anon'
                     and g.privilege_type in ('INSERT','UPDATE','DELETE'))
union all
select 'Bucket draft-assets: privat, batas 5 MB, hanya jpeg/png/webp',
       exists (select 1 from storage.buckets b where b.id='draft-assets' and not b.public
               and b.file_size_limit = 5242880 and b.allowed_mime_types @> array['image/jpeg','image/png','image/webp']
               and cardinality(b.allowed_mime_types)=3)
union all
select 'Bucket public-assets: publik, batas 5 MB, hanya jpeg/png/webp',
       exists (select 1 from storage.buckets b where b.id='public-assets' and b.public
               and b.file_size_limit = 5242880 and b.allowed_mime_types @> array['image/jpeg','image/png','image/webp']
               and cardinality(b.allowed_mime_types)=3)
union all
select 'Storage: tidak ada policy untuk anon pada storage.objects',
       not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and 'anon' = any(roles))
union all
select 'Storage: policy ' || pn || ' ada',
       exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname=pn)
from unnest(array['draft_assets_select_own','draft_assets_insert_own','draft_assets_update_own','draft_assets_delete_own',
                  'public_assets_insert_own','public_assets_update_own','public_assets_delete_own']) as pn
order by 2, 1;
-- Catatan: pemeriksaan "Storage: tidak ada policy untuk anon" mengharapkan policy Storage memakai role authenticated saja.
-- Policy bawaan Supabase/Dashboard buatan Anda sendiri dapat membuat baris ini false: periksa, jangan dihapus buta.
