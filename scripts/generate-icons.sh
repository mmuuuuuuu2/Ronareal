#!/usr/bin/env bash
# Menurunkan semua ukuran icon dari SATU sumber: brand/rona-icon-source.png
# Hanya resize proporsional (Lanczos). Tanpa crop, tanpa distorsi, tanpa ubah warna.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="brand/rona-icon-source.png"
OUT="public/icons"
mkdir -p "$OUT"
for s in 16 32 48 180 192 512; do
  convert "$SRC" -filter Lanczos -resize "${s}x${s}" -strip "PNG24:$OUT/rona-${s}.png"
done
cp "$OUT/rona-180.png" "$OUT/apple-touch-icon.png"
convert "$OUT/rona-16.png" "$OUT/rona-32.png" "$OUT/rona-48.png" "src/app/favicon.ico" 2>/dev/null \
  || convert "$OUT/rona-16.png" "$OUT/rona-32.png" "$OUT/rona-48.png" "public/favicon.ico"
echo "OK: ikon turunan dibuat dari $SRC"
