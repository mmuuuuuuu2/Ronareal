#!/usr/bin/env bash
# Menjalankan migration + tes RLS pada Postgres SEMENTARA (bukan Supabase asli) memakai shim.
# Pakai untuk CI/lokal cepat. Tetap jalankan juga tes terhadap `supabase start` sebelum rilis.
# Butuh binary Postgres 16 (initdb, pg_ctl, psql). Postgres menolak berjalan sebagai root,
# jadi bila dijalankan sebagai root, server dijalankan sebagai user "claude" (atau $PG_RUN_USER).
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${TEST_DB_PORT:-54329}"
RUN=()
BASE="$HOME"
if [ "$(id -u)" = "0" ]; then
  RUN=(runuser -u "${PG_RUN_USER:-claude}" --)
  BASE="$(getent passwd "${PG_RUN_USER:-claude}" | cut -d: -f6)"
fi
WORK="${TEST_DB_DIR:-$BASE/.rona-test-db}"

cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

rm -rf "$WORK"; mkdir -p "$WORK"; [ ${#RUN[@]} -gt 0 ] && chown "${PG_RUN_USER:-claude}" "$WORK"
"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

export PGHOST="$WORK" PGPORT="$PORT" PGUSER=postgres
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/shim_supabase.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -f "$f"; done
for t in supabase/tests/rls_isolation.sql supabase/tests/phase1_claim_and_assets.sql supabase/tests/phase2_claim_profile.sql supabase/tests/phase3_editor.sql supabase/tests/phase4_publish.sql supabase/tests/phase5_catalog.sql supabase/tests/phase6_draft_save.sql supabase/tests/phase7_account_settings.sql supabase/tests/phase8_integration.sql; do
  echo "== $t"
  psql -v ON_ERROR_STOP=1 -q -f "$t" 2>&1 | sed 's/^psql:[^ ]* //'
done

# Idempotensi: migration Phase 3–8 dijalankan ulang BERURUTAN (mengulang satu migration lama saja akan mengembalikan
# definisi fungsi lama yang sudah diganti migration berikutnya), lalu tes Phase 3–7 dijalankan lagi.
echo "== idempotensi migration Phase 3–8 (jalankan ulang berurutan)"
for f in supabase/migrations/20261016030000_phase3_editor.sql supabase/migrations/20261016040000_phase4_publish.sql supabase/migrations/20261016050000_phase5_catalog.sql supabase/migrations/20261019000000_phase6_draft_save.sql supabase/migrations/20261021000000_phase7_account_page_settings.sql supabase/migrations/20261023000000_phase8_hardening.sql; do
  psql -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v "NOTICE" || true
done
for t in supabase/tests/phase3_editor.sql supabase/tests/phase4_publish.sql supabase/tests/phase5_catalog.sql supabase/tests/phase6_draft_save.sql supabase/tests/phase7_account_settings.sql; do
  psql -v ON_ERROR_STOP=1 -q -f "$t" 2>&1 | grep -E "SELESAI|ERROR|FAIL"
done

# Simpan draft (tampilan) vs ubah konfigurasi katalog BERSAMAAN: 2 sesi paralel, tidak boleh ada pembaruan yang hilang.
echo "== simpan draft vs katalog bersamaan (2 sesi paralel)"
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase6_parallel_setup.sql >/dev/null
P6="$WORK/p6"; mkdir -p "$P6"
h6="begin; select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-0000000000f6\",\"role\":\"authenticated\"}',true); select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f6',true); set local role authenticated;"
: > "$P6/draft.sql"; : > "$P6/catalog.sql"
for i in $(seq 0 39); do
  echo "$h6 select public.save_draft(null, '{\"radius\":\"sm\"}'::jsonb, 0, $i); commit;" >> "$P6/draft.sql"
  echo "$h6 select public.set_catalog_settings(true, 'Judul $((i+1))'); commit;" >> "$P6/catalog.sql"
done
psql -v ON_ERROR_STOP=1 -q -t -A -f "$P6/draft.sql" > "$P6/d.out" 2> "$P6/d.err" & pd=$!
psql -v ON_ERROR_STOP=1 -q -t -A -f "$P6/catalog.sql" > "$P6/c.out" 2> "$P6/c.err" & pc=$!
f6=0; wait "$pd" || f6=1; wait "$pc" || f6=1
if [ "$f6" != "0" ] || cat "$P6"/*.err 2>/dev/null | grep -q .; then echo "FAIL: sesi paralel Phase 6 gagal"; cat "$P6"/*.err; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase6_parallel_check.sql 2>&1 | sed 's/^psql:[^ ]* //'

# Publish/unpublish BERSAMAAN: 3 sesi paralel pada satu halaman (data permanen di DB sementara ini).
echo "== publish bersamaan (3 sesi paralel)"
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase4_concurrency_setup.sql >/dev/null
CONC="$WORK/conc"; mkdir -p "$CONC"
hdr="begin; select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-0000000000e5\",\"role\":\"authenticated\"}',true); select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e5',true); set local role authenticated;"
: > "$CONC/pub.sql"; : > "$CONC/unpub.sql"
for i in $(seq 1 10); do
  echo "$hdr select public.publish_page_with_assets(); commit;" >> "$CONC/pub.sql"
  echo "$hdr select public.unpublish_page(); commit;" >> "$CONC/unpub.sql"
done
pids=()
for w in pub pub unpub; do
  psql -v ON_ERROR_STOP=1 -q -t -A -f "$CONC/$w.sql" > "$CONC/$w.$BASHPID.$RANDOM.out" 2> "$CONC/$w.$RANDOM.err" & pids+=($!)
done
fail=0; for pid in "${pids[@]}"; do wait "$pid" || fail=1; done
if [ "$fail" != "0" ] || cat "$CONC"/*.err 2>/dev/null | grep -q .; then echo "FAIL: ada sesi paralel yang gagal"; cat "$CONC"/*.err; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase4_concurrency_check.sql 2>&1 | sed 's/^psql:[^ ]* //'

# Dua pengguna berebut username yang SAMA dari dua sesi paralel: tepat satu menang; yang kalah mendapat username_taken.
echo "== balapan username (2 sesi paralel)"
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase7_race_setup.sql >/dev/null
RC="$WORK/race"; mkdir -p "$RC"
: > "$RC/a.sql"; : > "$RC/b.sql"
for i in $(seq 1 25); do
  ua="00000000-0000-0000-0001-$(printf '%012d' "$i")"; ub="00000000-0000-0000-0002-$(printf '%012d' "$i")"
  echo "begin; select set_config('request.jwt.claims','{\"sub\":\"$ua\",\"role\":\"authenticated\"}',true); select set_config('request.jwt.claim.sub','$ua',true); set local role authenticated; select public.change_username('rebut-$i'); commit;" >> "$RC/a.sql"
  echo "begin; select set_config('request.jwt.claims','{\"sub\":\"$ub\",\"role\":\"authenticated\"}',true); select set_config('request.jwt.claim.sub','$ub',true); set local role authenticated; select public.change_username('rebut-$i'); commit;" >> "$RC/b.sql"
done
psql -q -t -A -f "$RC/a.sql" > "$RC/a.out" 2> "$RC/a.err" & pa=$!
psql -q -t -A -f "$RC/b.sql" > "$RC/b.out" 2> "$RC/b.err" & pb=$!
wait "$pa" || true; wait "$pb" || true
# Satu-satunya galat yang diizinkan: username_taken (yang kalah balapan). Deadlock atau galat lain = gagal.
if grep -h "ERROR" "$RC"/*.err | grep -v "username_taken" | grep -q .; then echo "FAIL: galat tak terduga pada balapan"; grep -h "ERROR" "$RC"/*.err | grep -v username_taken | head; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase7_race_check.sql 2>&1 | sed 's/^psql:[^ ]* //'

# Publish vs simpan draft BERSAMAAN: urutan kunci harus sama (pages -> profiles) agar tidak ada deadlock (Phase 8).
echo "== publish vs simpan draft bersamaan (2 sesi paralel)"
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase8_lock_setup.sql >/dev/null
LK="$WORK/lock"; mkdir -p "$LK"
h8="begin; select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-0000000000d8\",\"role\":\"authenticated\"}',true); select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d8',true); set local role authenticated;"
: > "$LK/pub.sql"; : > "$LK/save.sql"
for i in $(seq 0 59); do
  echo "$h8 select public.publish_page_with_assets('00000000-0000-0000-0000-0000000000d8/avatar/kunci.png'); commit;" >> "$LK/pub.sql"
  echo "$h8 select public.save_draft(null, '{\"radius\":\"sm\"}'::jsonb, 0, $i); commit;" >> "$LK/save.sql"
done
psql -q -t -A -f "$LK/pub.sql" > "$LK/p.out" 2> "$LK/p.err" & lp=$!
psql -q -t -A -f "$LK/save.sql" > "$LK/s.out" 2> "$LK/s.err" & ls_=$!
wait "$lp" || true; wait "$ls_" || true
if cat "$LK"/*.err | grep -q .; then echo "FAIL: galat pada sesi paralel publish/simpan"; sort "$LK"/*.err | uniq -c | head; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/phase8_lock_check.sql 2>&1 | sed 's/^psql:[^ ]* //'

