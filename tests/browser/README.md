# Pemeriksaan browser (harness)

Menjalankan komponen **asli** RONA di **Chromium nyata** (Playwright). Ini bukan `next build` dan bukan Supabase.

Yang nyata: komponen React proyek, CSS proyek yang dikompilasi dengan Tailwind 4 sungguhan (`tw.mjs`), mesin layout/fokus/`<dialog>`/media-query Chromium.

Yang diganti stub (`stubs/`): server action (tidak ada database; panggilan direkam di `window.__calls`), `next/link`, `next/image`, dan `motion/react` — jadi **animasi Motion tidak diuji di sini**.

Prasyarat (diperiksa otomatis oleh `scripts/preflight-browser.mjs`; bila tidak lengkap, `test:browser` keluar dengan kode 10 = SKIPPED, bukan lulus): esbuild, tailwindcss v4, playwright + Chromium (di folder `RONA_TOOLS`, tidak diasumsikan ada di `/opt/npm-tools`), serta react & react-dom (`RONA_NODE_PATH`, bawaan `./node_modules`).

Jalankan: `npm run test:browser` (atau `bash scripts/browser-check.sh`). Lihat variabel `RONA_TOOLS` / `RONA_NODE_PATH` di skrip bila alat tidak ada di lokasi bawaan.
Tangkapan layar ditulis ke `tests/browser/shots/` (diabaikan Git).
