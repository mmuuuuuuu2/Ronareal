-- Hasil: 60 publish + 60 simpan draft bersamaan tanpa deadlock; tidak ada simpan yang hilang; snapshot konsisten.
do $$
declare srev int; nsnap int; pub boolean;
begin
  select settings_rev, is_published into srev, pub from public.pages where owner_id = '00000000-0000-0000-0000-0000000000d8';
  select count(*) into nsnap from public.published_snapshots s join public.pages p on p.id = s.page_id where p.owner_id = '00000000-0000-0000-0000-0000000000d8';
  if srev <> 60 then raise exception 'FAIL: settings_rev % (seharusnya 60)', srev; end if;
  if nsnap <> 60 or not pub then raise exception 'FAIL: snapshot % (seharusnya 60), terbit=%', nsnap, pub; end if;
  raise notice 'PASS: publish vs simpan draft bersamaan — tanpa deadlock, 60 simpan + 60 snapshot utuh';
end $$;
