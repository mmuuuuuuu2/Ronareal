-- Memeriksa hasil balapan: untuk tiap nama "rebut-N" TEPAT SATU dari dua pemohon memilikinya; tidak ada username ganda.
do $$
declare i int; n int; dup int; owners int;
begin
  select count(*) - count(distinct username) into dup from public.profiles;
  if dup <> 0 then raise exception 'FAIL: ada username ganda (%)', dup; end if;
  for i in 1..25 loop
    select count(*) into owners from public.profiles
     where username = 'rebut-' || i
       and id in (('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid);
    if owners <> 1 then raise exception 'FAIL: rebut-% dimiliki % akun (seharusnya tepat 1)', i, owners; end if;
  end loop;
  select count(*) into n from public.profiles where username like 'rebut-%';
  if n <> 25 then raise exception 'FAIL: % pemenang (seharusnya 25)', n; end if;
  raise notice 'PASS: balapan username — 25 nama diperebutkan dua sesi paralel, tiap nama tepat satu pemilik, tanpa duplikat';
end $$;
