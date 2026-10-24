# RONA — Laporan Phase 1 (Backend Foundation) — PARSIAL

Paket: `RONA_Phase_1_Backend_Foundation_Partial.zip`

## Status
| Hal | Status |
|---|---|
| Source code dikemas | Ya |
| Production build | Belum dijalankan (tidak ada aplikasi/`package.json`) |
| Integrasi Supabase diuji | Belum (host proyek diblokir proxy egress: 403 pada CONNECT) |
| Deployment Vercel / produksi | Belum |

## Dikerjakan
- `.env.local` (lokal, git-ignored, **tidak** ada di ZIP) berisi URL + anon key dari lampiran; format kunci diperiksa: role `anon`, referensi proyek cocok dengan URL, berlaku sampai 2036. Penamaan tunggal: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Migration `20261016010000_phase1_onboarding_assets.sql`: kolom background halaman; `claim_username()` (atomik) dan `is_username_available()`; `publish_page()` memvalidasi avatar+background dan menyertakan background; policy storage ketat per jenis aset (`<uid>/<avatar|background|link|catalog>/<nama>.<jpg|jpeg|png|webp>`), tanpa SELECT policy pada bucket publik (tidak bisa enumerasi).
- Tes `phase1_claim_and_assets.sql`.

## Tabel, indeks, RLS
Tabel (RLS aktif semua): profiles, pages, page_links, catalog_items, catalog_images, published_snapshots, reserved_usernames. Indeks: unik username; unik `pages.owner_id`; `(page_id, position)` pada links dan items; unik `(item_id, position)` pada images; unik `(page_id, version)` pada snapshots. Audit query publik: `get_public_page` memakai indeks yang ada; tidak ada N+1 (satu RPC).

## Bucket & policy
`draft-assets` privat; `public-assets` publik-baca (hanya salinan terbit), tulis hanya pemilik. 5 MB, JPEG/PNG/WebP. Policy: `draft-assets` 4 (select/insert/update/delete), `public-assets` 3 (insert/update/delete) — lihat migration.

## Pengujian yang benar-benar dijalankan
`bash scripts/test-db.sh` pada Postgres 16 sementara + shim (bukan Supabase asli): kedua migration diterapkan tanpa error; **53 pemeriksaan PASS, 0 FAIL** pada `rls_isolation.sql` dan `phase1_claim_and_assets.sql`, mencakup isolasi A vs B pada tabel dan storage, klaim username, validasi aset saat publish, dan kegagalan publish yang tidak merusak versi live. Format kunci Supabase diperiksa.

**Tidak dijalankan:** koneksi database/Auth nyata, registrasi/login/logout, proteksi dashboard, upload nyata, TypeScript, build, performa, deployment.

## Perlu tindakan Anda
1. Izinkan akses dari lingkungan kerja ke `zaoppiyawthfvfxtlnjd.supabase.co` dan `registry.npmjs.org`, atau jalankan langkah README B.3–B.6 sendiri.
2. Audit schema yang ada (README B.3) lalu terapkan 2 migration berurutan.
3. Atur Auth redirect URL (README B.6).

## Belum selesai
Aplikasi Next.js (scaffold, klien Supabase SSR, halaman login/registrasi/dashboard, middleware/proxy proteksi, logout, penanganan error Auth), lockfile, build, tes UI. Variabel Vercel nanti: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
