-- Invarian setelah publish/unpublish bersamaan (dijalankan sebagai admin).
do $$
declare
  pid uuid; n int; mx int; dist int; snap_ver int; i int;
begin
  select id into pid from public.pages where owner_id = '00000000-0000-0000-0000-0000000000e5';
  select count(*), max(version), count(distinct version) into n, mx, dist from public.published_snapshots where page_id = pid;
  if n <> mx or n <> dist then raise exception 'FAIL: versi tidak berurutan/duplikat (n=%, max=%, distinct=%)', n, mx, dist; end if;
  select s.version into snap_ver from public.pages p join public.published_snapshots s on s.id = p.published_snapshot_id where p.id = pid;
  if snap_ver <> mx then raise exception 'FAIL: pointer live (v%) bukan versi terbaru (v%)', snap_ver, mx; end if;
  if exists (select 1 from generate_series(1, mx) g where not exists (select 1 from public.published_snapshots where page_id = pid and version = g)) then
    raise exception 'FAIL: ada celah versi'; end if;
  raise notice 'PASS: % snapshot, versi 1..% berurutan tanpa duplikat/celah; pointer live = versi terbaru', n, mx;
end $$;
