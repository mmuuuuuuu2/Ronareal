#!/usr/bin/env bash
# Verifikasi RONA dengan dependency ASLI. Jalankan di komputer/CI yang bisa mengakses registry npm.
#
# Prinsip:
#   * Tidak mengubah package.json / versi dependency, dan tidak pernah membuat lockfile manual.
#     package-lock.json hanya dihasilkan oleh `npm install` asli (jika belum ada) atau dipatuhi `npm ci` (jika sudah ada).
#   * Setiap langkah berstatus PASS, FAIL, atau SKIPPED, dengan EXIT CODE ASLI. SKIPPED (prasyarat tidak ada / dependen pada
#     langkah yang gagal) TIDAK PERNAH dihitung berhasil.
#   * Dua kelompok: INTI (install, lockfile, secrets, unit, lint, build, typecheck) dan TAMBAHAN (test:db, test:browser)
#     yang butuh prasyarat di luar npm (PostgreSQL 16; esbuild+Playwright+Chromium).
#
# Pakai:  bash scripts/verify-with-npm.sh [--core-only] [--skip-db] [--skip-browser]
#         RONA_TOOLS=<folder>  lokasi node_modules berisi esbuild, tailwindcss v4, playwright (lihat docs)
#         PGBIN=<folder>       lokasi binary PostgreSQL 16 (initdb, pg_ctl, psql)
#
# Kode keluar:
#   0  semua langkah PASS (tidak ada FAIL dan tidak ada SKIPPED)
#   1  ada langkah FAIL
#   4  tidak ada FAIL, tetapi ada langkah SKIPPED (hasil BELUM lengkap -> status tetap PARTIAL)
#   2  registry npm tidak terjangkau   3  Node.js lebih lama dari 22.18
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

SKIP_DB=0; SKIP_BROWSER=0
for a in "$@"; do
  case "$a" in
    --core-only) SKIP_DB=1; SKIP_BROWSER=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --skip-browser) SKIP_BROWSER=1 ;;
    -h|--help) sed -n 2,24p "$0"; exit 0 ;;
    *) echo "Argumen tidak dikenal: $a (lihat --help)"; exit 64 ;;
  esac
done

OUT=verification-output
rm -rf "$OUT"; mkdir -p "$OUT"
TSV="$OUT/results.tsv"; SUMMARY="$OUT/summary.txt"
: > "$TSV"
say() { echo "$*" | tee -a "$SUMMARY"; }
now() { date +%s; }
sha() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -c1-16; }
first_error() {  # cetak ~15 baris mulai dari baris pertama yang memuat kata galat; bila tidak ada, 15 baris terakhir
  local n; n=$(grep -n -m1 -i -E 'error|ERR!|FAIL|not ok|denied' "$1" | cut -d: -f1)
  if [ -n "$n" ]; then sed -n "${n},$((n+14))p" "$1"; else tail -n 15 "$1"; fi
}

# ---- pencatatan hasil ----------------------------------------------------------------------------------------------
record() {  # record <nama> <PASS|FAIL|SKIPPED> <rc|-> <catatan>
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$TSV"
  say "[$2] $1${3:+ (exit $3)}${4:+ — $4}"
}
run() {  # run <nama> <perintah...>  -> PASS bila exit 0, selain itu FAIL; log lengkap di $OUT/<nama>.log
  local name="$1"; shift
  local t0; t0=$(now)
  "$@" >"$OUT/$name.log" 2>&1; local rc=$?
  local dt=$(( $(now) - t0 ))
  if [ $rc -eq 0 ]; then record "$name" PASS "$rc" "${dt}s"; else
    record "$name" FAIL "$rc" "${dt}s; log: $OUT/$name.log"
    echo "      --- awal galat (dari $OUT/$name.log) ---" | tee -a "$SUMMARY"
    first_error "$OUT/$name.log" | sed 's/^/      /' | tee -a "$SUMMARY"
  fi
  return $rc
}
skip() { record "$1" SKIPPED "-" "$2"; }
status_of() { awk -F'\t' -v n="$1" '$1==n {print $2}' "$TSV" | tail -n1; }
finish() {  # finish <kode-bawaan>
  local p f s; p=$(awk -F'\t' '$2=="PASS"' "$TSV" | wc -l); f=$(awk -F'\t' '$2=="FAIL"' "$TSV" | wc -l); s=$(awk -F'\t' '$2=="SKIPPED"' "$TSV" | wc -l)
  say ""; say "================ RINGKASAN ================"
  say "PASS=$p  FAIL=$f  SKIPPED=$s   (SKIPPED bukan berhasil; EXIT CODE asli ada di $TSV)"
  if [ "$f" -eq 1 ] && [ "$(status_of registry-ping)" = "FAIL" ]; then
    say "STATUS: BLOKIR LINGKUNGAN — registry npm tidak terjangkau (satu-satunya FAIL). Ini bukan kegagalan kode; jalankan ulang di lingkungan dengan akses registry."; RC=2
  elif [ "$f" -gt 0 ]; then say "STATUS: GAGAL — ada langkah FAIL. Kirim $SUMMARY dan galat pertama dari log yang gagal."; RC=1
  elif [ "$s" -gt 0 ]; then say "STATUS: PARTIAL — tidak ada FAIL, tetapi $s langkah SKIPPED (lihat alasan di atas). Belum boleh disebut siap produksi."; RC=4
  else say "STATUS: semua langkah di skrip ini PASS. Ini BUKAN pengganti uji Supabase asli / Vercel / perangkat nyata (lihat docs/production-readiness-report.md §8)."; RC=0; fi
  [ -n "${1:-}" ] && RC=$1
  exit $RC
}

# ---- 0. lingkungan -------------------------------------------------------------------------------------------------
NODE_V=$(node -v 2>/dev/null || echo "tidak ada")
NPM_V=$(npm -v 2>/dev/null || echo "tidak ada")
{
  echo "Tanggal (UTC)   : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Node.js         : $NODE_V   (syarat: >= 22.18.0, lihat package.json engines)"
  echo "npm             : $NPM_V"
  echo "Registry        : $(npm config get registry 2>/dev/null)"
  echo "OS / arsitektur : $(uname -sr) / $(uname -m)"
  echo "package.json    : sha256 $(sha package.json)"
  echo "package-lock    : $( [ -f package-lock.json ] && echo "ADA (sha256 $(sha package-lock.json))" || echo 'belum ada (akan dibuat oleh npm install)')"
} | tee "$SUMMARY"
say ""

if ! node -e '
  const [a,b]=process.versions.node.split(".").map(Number);
  process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null; then
  record node-version FAIL 1 "Node $NODE_V < 22.18.0 (butuh type-stripping bawaan untuk node --test *.ts). Pasang Node 22 LTS terbaru lalu ulangi."
  finish 3
fi
record node-version PASS 0 "$NODE_V"

# ---- 1. INTI -------------------------------------------------------------------------------------------------------
say ""; say "### INTI"
REGISTRY_OK=0; INSTALL_OK=0
if run registry-ping npm ping; then REGISTRY_OK=1; fi
if [ $REGISTRY_OK -eq 0 ]; then
  say "      Registry tidak terjangkau: install/lint/build/typecheck/browser tidak dapat dijalankan (bukan kegagalan kode)."
  skip install "bergantung pada registry-ping"
  skip lockfile "bergantung pada install"
else
  LOCK_BEFORE=0; [ -f package-lock.json ] && LOCK_BEFORE=1
  if [ $LOCK_BEFORE -eq 1 ]; then INSTALL_CMD=(npm ci); else INSTALL_CMD=(npm install); fi
  if run install "${INSTALL_CMD[@]}"; then
    INSTALL_OK=1
    if [ ! -f package-lock.json ]; then record lockfile FAIL 1 "package-lock.json tidak terbentuk setelah install"
    else
      npm ci --dry-run --ignore-scripts >"$OUT/lockfile.log" 2>&1; lrc=$?
      if [ $lrc -eq 0 ]; then
        record lockfile PASS 0 "$( [ $LOCK_BEFORE -eq 1 ] && echo 'lockfile dari repo, sinkron dengan package.json' || echo 'DIBUAT oleh npm install ini (sha256 '"$(sha package-lock.json)"'): periksa lalu commit package-lock.json')"
      else record lockfile FAIL "$lrc" "lockfile tidak sinkron dengan package.json (log: $OUT/lockfile.log)"; first_error "$OUT/lockfile.log" | sed 's/^/      /' | tee -a "$SUMMARY"; fi
    fi
  else
    skip lockfile "bergantung pada install"
  fi
  npm audit --omit=dev >"$OUT/audit-info.log" 2>&1; say "      (info, tidak dihitung) npm audit --omit=dev: exit $? — lihat $OUT/audit-info.log"
fi

# Tidak butuh node_modules: tetap dijalankan walau registry/instalasi bermasalah.
run check-secrets node scripts/check-secrets.mjs
run test-unit npm test

# Langkah berikut butuh dependency terpasang.
if [ $INSTALL_OK -eq 1 ]; then
  run lint npm run lint
  # Build: pakai env yang ada. Bila belum ada .env.local / variabel, pakai nilai PLACEHOLDER (bukan secret, tidak menyambung
  # ke Supabase) agar build tidak gagal palsu; dicatat jelas pada ringkasan.
  BUILD_ENV=()
  BUILD_NOTE="env nyata"
  if [ ! -f .env.local ] && [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
    BUILD_ENV=(NEXT_PUBLIC_SUPABASE_URL="https://placeholder-build-only.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_PLACEHOLDER_BUILD_ONLY" NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}")
    BUILD_NOTE="env PLACEHOLDER (tanpa koneksi Supabase): hanya membuktikan kompilasi/bundling, bukan konfigurasi produksi"
  fi
  say "      build memakai: $BUILD_NOTE"; echo "$BUILD_NOTE" > "$OUT/build-env.txt"
  run build env NEXT_TELEMETRY_DISABLED=1 ${BUILD_ENV[@]+"${BUILD_ENV[@]}"} npm run build
  # typecheck SETELAH build: `next build` menghasilkan next-env.d.ts dan .next/types yang dibutuhkan tsconfig.json.
  # Bila build FAIL, typecheck tetap dijalankan tetapi galat tentang next-env.d.ts/.next/types dapat menyesatkan.
  [ "$(status_of build)" = "FAIL" ] && say "      (catatan: build FAIL; hasil typecheck berikut mungkin ikut terdampak next-env.d.ts yang belum terbentuk)"
  run typecheck npm run typecheck
else
  for n in lint build typecheck; do skip "$n" "bergantung pada install (status: $( [ $REGISTRY_OK -eq 0 ] && echo 'registry tidak terjangkau' || echo 'install FAIL'))"; done
fi

# ---- 2. TAMBAHAN: prasyarat di luar npm -----------------------------------------------------------------------------
say ""; say "### TAMBAHAN (prasyarat tambahan; tidak terpenuhi = SKIPPED, bukan PASS)"

# -- test:db : PostgreSQL 16 (initdb, pg_ctl, psql) --
find_pg16() {
  local c d
  for d in "${PGBIN:-}" /usr/lib/postgresql/16/bin /usr/pgsql-16/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin "$(dirname "$(command -v initdb 2>/dev/null || echo /nonexistent/x)")"; do
    [ -n "$d" ] && [ -x "$d/initdb" ] && [ -x "$d/pg_ctl" ] && [ -x "$d/psql" ] || continue
    "$d/initdb" --version 2>/dev/null | grep -q ' 16\.' && { echo "$d"; return 0; }
  done
  return 1
}
if [ $SKIP_DB -eq 1 ]; then skip test-db "dilewati lewat flag --skip-db/--core-only"
else
  PG16=$(find_pg16) || PG16=""
  if [ -z "$PG16" ]; then
    skip test-db "binary PostgreSQL 16 (initdb, pg_ctl, psql) tidak ditemukan; pasang PostgreSQL 16 atau atur PGBIN=<folder bin>"
  elif [ "$(id -u)" = "0" ] && { ! command -v runuser >/dev/null 2>&1 || ! id "${PG_RUN_USER:-claude}" >/dev/null 2>&1; }; then
    skip test-db "berjalan sebagai root: Postgres menolak root; butuh runuser dan user non-root (PG_RUN_USER, bawaan 'claude'). Jalankan sebagai user biasa."
  else
    echo "PostgreSQL: $("$PG16/psql" --version) di $PG16" >> "$SUMMARY"
    run test-db env PGBIN="$PG16" PATH="$PG16:$PATH" npm run test:db
  fi
fi

# -- test:browser : esbuild + tailwindcss v4 + playwright + Chromium + react/react-dom --
if [ $SKIP_BROWSER -eq 1 ]; then skip test-browser "dilewati lewat flag --skip-browser/--core-only"
elif [ $INSTALL_OK -eq 0 ] && [ ! -d node_modules/react ] && [ -z "${RONA_NODE_PATH:-}" ]; then
  skip test-browser "react/react-dom belum terpasang (install tidak berhasil); atur RONA_NODE_PATH bila ada di lokasi lain"
else
  if PRE=$(node scripts/preflight-browser.mjs 2>"$OUT/browser-preflight.log"); then
    echo "Harness browser: $(cat "$OUT/browser-preflight.log")" >> "$SUMMARY"
    RT=$(echo "$PRE" | sed -n 's/^RONA_TOOLS=//p'); RN=$(echo "$PRE" | sed -n 's/^RONA_NODE_PATH=//p')
    run test-browser env RONA_TOOLS="$RT" RONA_NODE_PATH="$RN" npm run test:browser
  else
    skip test-browser "prasyarat tidak lengkap: $(grep '^- ' "$OUT/browser-preflight.log" | sed 's/^- //' | paste -sd'|' - | cut -c1-400) (rincian + cara menyiapkan: $OUT/browser-preflight.log)"
  fi
fi

# ---- 3. versi terpasang (untuk laporan) ----------------------------------------------------------------------------
if [ $INSTALL_OK -eq 1 ]; then
  say ""; say "Versi terpasang (dari node_modules):"
  for p in next react react-dom typescript eslint tailwindcss @supabase/supabase-js @supabase/ssr motion; do
    v=$(node -p "require('./node_modules/$p/package.json').version" 2>/dev/null || echo "-"); say "  $p $v"
  done
fi

finish
