-- Memeriksa hasil 2 sesi paralel: 40x save_draft(tampilan) vs 40x set_catalog_settings. Tidak ada pembaruan yang hilang.
do $$
declare cfg jsonb; srev int;
begin
  select draft_config, settings_rev into cfg, srev from public.pages where owner_id = '00000000-0000-0000-0000-0000000000f6';
  if srev <> 40 then raise exception 'FAIL: settings_rev % (seharusnya 40): ada simpan tampilan yang hilang', srev; end if;
  if cfg #>> '{settings,radius}' <> 'sm' then raise exception 'FAIL: tampilan terakhir hilang: %', cfg #>> '{settings,radius}'; end if;
  if cfg #>> '{catalog,title}' <> 'Judul 40' then raise exception 'FAIL: katalog terakhir hilang: %', cfg #>> '{catalog,title}'; end if;
  raise notice 'PASS: paralel — 40 simpan tampilan + 40 ubah katalog, tak ada pembaruan hilang (rev=%, katalog=%)', srev, cfg #>> '{catalog,title}';
end $$;
