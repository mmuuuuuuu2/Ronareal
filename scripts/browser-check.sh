#!/usr/bin/env bash
# Pemeriksaan BROWSER (Chromium nyata) atas komponen asli: halaman publik + katalog, editor, dan form auth.
# BUKAN `next build`, BUKAN Supabase: server action diganti stub; Motion diganti stub (lihat tests/browser/README.md).
# Butuh: esbuild, tailwindcss (v4), playwright + Chromium, serta react/react-dom. Atur lokasi lewat variabel lingkungan:
#   RONA_TOOLS      folder induk node_modules berisi esbuild, tailwindcss v4, playwright (+ Chromium). Bila tidak diatur: folder proyek,
#                   lalu /opt/npm-tools HANYA bila ada. Pemeriksaan: scripts/preflight-browser.mjs
#   RONA_NODE_PATH  lokasi node_modules berisi react & react-dom (bawaan: ./node_modules proyek)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
# Periksa prasyarat DULU (esbuild, tailwindcss v4, playwright, Chromium, react, react-dom). Tidak ada yang diasumsikan.
# Bila tidak lengkap: keluar dengan kode 10 (BUKAN lulus) dan jelaskan apa yang kurang.
if PRE="$(node "$REPO/scripts/preflight-browser.mjs")"; then
  while IFS='=' read -r k v; do case "$k" in RONA_TOOLS|RONA_NODE_PATH) export "$k=$v" ;; esac; done <<< "$PRE"
else
  echo "test:browser TIDAK dijalankan (prasyarat tidak lengkap; lihat pesan di atas). Status: SKIPPED, bukan lulus." >&2
  exit 10
fi
cd "$REPO/tests/browser"
node tw.mjs app.css
node build.mjs
for t in public editor auth settings; do echo "== $t"; node "run-$t.cjs"; done
