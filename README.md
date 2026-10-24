# RONA

Platform personal link page premium, multi-pengguna: `domain.com/username` dan `domain.com/username/services`.
(`domain.com` hanya format target. Domain belum dimiliki; pakai `*.vercel.app` dulu.)

## Status: **PARTIAL** — siap diunggah ke GitHub, **belum** terbukti build/deploy

Kode, migration, tes, workflow CI, dan dokumentasi sudah lengkap. Yang **belum pernah dijalankan** (lingkungan pembuat tidak punya akses registry npm, Supabase, maupun Vercel): `npm install`, `package-lock.json`, `next build`, `eslint`/`tsc` asli, Supabase asli, Next asli (ISR/`revalidatePath`), Vercel. Status naik dari PARTIAL **hanya** setelah GitHub Actions benar-benar hijau **dan** checklist pasca-deploy lulus. Laporan jujur per kategori: **`docs/production-readiness-report.md`**.

## Alur paling sederhana (urutan yang harus Anda ikuti)

Anda **tidak perlu** memasang Node.js di komputer untuk jalur ini; semua pemasangan dan pengujian dikerjakan GitHub Actions dan Vercel.

| # | Di mana | Yang Anda lakukan | Hasil yang diharapkan |
|---|---|---|---|
| 1 | Komputer | Ekstrak ZIP. Hasilnya folder `rona/` (di dalamnya ada `package.json`, `src/`, `.github/`). Pasang **GitHub Desktop** (desktop.github.com) bila belum ada. | — |
| 2 | GitHub Desktop | *File → Add local repository* → pilih folder `rona` → bila diminta *create a repository* → *Commit to main* → **Publish repository** → centang **Keep this code private**. Jangan seret-lepas ke website GitHub (file berawalan titik seperti `.github` sering terlewat). | Repo privat di akun Anda berisi `.github/workflows/`, `src/`, `supabase/`, `package.json`; **tidak** ada `.env.local`. |
| 3 | GitHub → tab **Actions** | Tunggu run **CI** dan **Generate lockfile** (beberapa menit). Workflow *Generate lockfile* membuat `package-lock.json` **asli** lewat npm dan meng-commit-nya, lalu menjalankan CI ulang dengan `npm ci`. Buka run CI terakhir → **Summary**: tabel PASS/FAIL/SKIPPED. | Semua baris ✅. Bila ada ❌: kirim isi Summary (galat pertama) ke saya; jangan lanjut ke Vercel. |
| 4 | Supabase (proyek **uji**) | Ikuti `docs/supabase-test-project-verification.md` §A: jalankan 9 migration berurutan di SQL Editor, lalu `supabase/verify/schema_check.sql` (semua baris `true`), atur Auth URL. Ini satu-satunya langkah yang sengaja manual: saya tidak menerapkan migration ke akun Anda. | `schema_check.sql` semua `true`. |
| 5 | Vercel | *Add New → Project* → impor repo → isi 3 environment variables (tabel di bawah) → **Deploy**. | Build hijau; URL `https://<nama>.vercel.app`. |
| 6 | Supabase | Tambahkan URL Vercel ke *Site URL* dan *Redirect URLs* (`.../auth/callback`). Bila `NEXT_PUBLIC_SITE_URL` baru diisi/diubah → **Redeploy** di Vercel. | Tautan email Auth berfungsi. |
| 7 | Browser | Jalankan `docs/post-deployment-checklist.md` (registrasi → publish → isolasi dua akun → cache). | Semua baris lulus; catat hasil di laporan. |

Catatan keamanan: jangan pernah menempelkan **service-role key** atau secret ke chat, GitHub, atau Vercel. Aplikasi hanya memakai kunci **anon/publishable**.

### Environment variables di Vercel
Isi di *Project → Settings → Environment Variables*, untuk **Production dan Preview** (nilai di bawah hanya contoh/placeholder):

| Nama | Nilai (placeholder) | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon atau sb_publishable_... key>` | Hanya kunci publik. Aplikasi menolak `service_role`/`sb_secret_` |
| `NEXT_PUBLIC_SITE_URL` | **Production:** `https://<nama>.vercel.app` (atau domain final) · **Preview:** lihat di bawah | Tanpa slash akhir. **Wajib.** |

**Mengapa `NEXT_PUBLIC_SITE_URL` penting:** dipakai untuk canonical/Open Graph, tautan email Auth (konfirmasi, ganti email, reset password), dan tombol salin/buka URL. Aplikasi **tidak** mempercayai header Host, jadi tanpa nilai ini di build produksi canonical menjadi relatif dan tautan email Auth tidak membawa redirect. Nilainya ikut tertanam saat **build** (awalan `NEXT_PUBLIC_`): setelah diubah, **Redeploy**.

**Preview:** URL Preview Vercel berubah tiap commit, padahal URL callback harus terdaftar di Supabase. Cara paling sederhana: **uji Auth hanya di Production** (pakai proyek Supabase uji lebih dulu), dan isi `NEXT_PUBLIC_SITE_URL` untuk Preview dengan URL Production yang sama (bila kosong, canonical dan tautan di Preview menjadi relatif/tanpa redirect). Alternatif: buat branch `staging` dan isi variabel Preview khusus branch itu dengan alias tetapnya (`https://<proyek>-git-staging-<tim>.vercel.app`), lalu daftarkan di Supabase. Jangan memakai proyek Supabase produksi untuk Preview.

**Pengaturan proyek Vercel:** Framework Preset **Next.js** (otomatis), Build Command bawaan (`next build`), Output bawaan, **Node.js 22.x** (*Settings → General → Node.js Version*). Tidak ada `vercel.json` (tidak diperlukan). Header keamanan dan `Cache-Control: private, no-store` untuk rute privat didefinisikan di `next.config.ts`; **CSP sengaja belum ada** (lihat `docs/production-readiness-report.md` §6: mulai dari Report-Only, jangan langsung enforcing).

### Migration dan Supabase (ringkas)
- 9 migration di `supabase/migrations/` — urutan dan isi: `docs/migrations.md`. **Tidak pernah dijalankan otomatis** oleh CI, Vercel, atau saya.
- Prosedur uji lengkap (Auth URL, Storage bucket, RLS, RPC, 18 tes manual): `docs/supabase-test-project-verification.md`; pemeriksa skema read-only: `supabase/verify/schema_check.sql`.
- Terapkan migration 9 (`20261023000000_phase8_hardening.sql`) **sebelum** kode Phase 8 dipakai (memperbaiki deadlock Terbitkan vs Simpan draft dan mencabut hak tabel berlebih).
- Backup dulu bila proyek sudah berisi data.

### Membaca hasil CI
- Tab **Actions** → run **CI** → **Summary**: tabel langkah (✅ PASS / ❌ FAIL / ⏭️ SKIPPED) + versi Node/npm/paket terpasang. Log lengkap: artifact **verification-output** (30 hari; dipindai dari pola secret sebelum diunggah).
- CI **gagal** bila ada langkah FAIL **atau** SKIPPED. Tidak ada `continue-on-error`. Langkah: `npm ci`/`npm install`, pemeriksaan lockfile, secret scan, tes unit, lint, build (env **placeholder**, tanpa Supabase), typecheck, `test:db` (Postgres 16 sementara + shim, **bukan** Supabase asli), `test:browser` (Chromium, server action = stub).
- CI hijau **belum** berarti siap produksi: CI tidak menguji Supabase asli, Vercel, ISR, email Auth, atau perangkat nyata.
- Bila *Generate lockfile* gagal mem-push (branch dilindungi): unduh artifact `package-lock-generated`, taruh di root repo, commit.

## Jalur alternatif: menjalankan sendiri di komputer
Butuh **Node.js ≥ 22.18** (`.nvmrc` = 22), Git, dan opsional PostgreSQL 16. Lalu:
```bash
bash scripts/verify-with-npm.sh      # install, lockfile, secrets, unit, lint, build, typecheck (+ db/browser bila prasyarat ada)
cp .env.example .env.local           # isi 3 variabel (Windows PowerShell: Copy-Item .env.example .env.local)
npm run dev                          # http://localhost:3000
```
Detail skrip (PASS/FAIL/SKIPPED, kode keluar, prasyarat db/browser): `docs/production-readiness-report.md` §1. Skrip npm: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:db`, `test:browser`, `check:secrets`, `check` (secrets+typecheck+lint+test). Uji manual aplikasi: `docs/manual-tests.md`.

## Referensi dokumen
`docs/production-readiness-report.md` (hasil nyata vs belum), `docs/post-deployment-checklist.md`, `docs/supabase-test-project-verification.md`, `docs/migrations.md`, `docs/manual-tests.md`, `docs/phase-0…8-report.md` (riwayat per fase).

## Yang ada di paket
```
.github/workflows/             ci.yml (verifikasi PASS/FAIL/SKIPPED) dan lockfile.yml (membuat package-lock.json asli lewat npm)
src/app/[username]/            halaman publik (ISR, metadata, 404) — kini menampilkan katalog dari snapshot
src/app/dashboard/editor/      editor + server actions: draft, link, upload, publish, **catalog-actions**
src/components/page/           PageView (preview DAN publik), **catalog-section** (grid + modal detail/galeri)
src/components/editor/         editor-shell, profil, tampilan, link manager, **catalog-panel/-item-card/-photos**
src/components/publish/        panel penerbitan, salin/buka URL
src/components/ui/             **Phase 6:** confirm-dialog, tabs, toast, empty-state (+ text-field, submit-button)
src/components/motion/         **Phase 6:** MotionProvider (reduced-motion mengikuti sistem; hanya dashboard)
src/app/dashboard/settings/    **Phase 7:** halaman pengaturan + server actions (akun, username, SEO)
src/components/settings/       **Phase 7:** shell bertab + bagian Akun / Username / Halaman / SEO / Status
src/lib/log.ts                 **Phase 8:** logging server aman (samaran JWT/token/email)
src/lib/seo/ account/ settings/ **Phase 7:** SEO & metadata publik, validasi akun, pemuat data pengaturan
src/styles/tokens.css          design tokens (warna, status, tipografi, jarak, elevasi, fokus, safe area, motion)
src/lib/catalog/               validasi item, CTA & WhatsApp, foto, galeri, state editor, parser snapshot
src/lib/publish/ editor/       snapshot→tampilan, rencana aset (kini memuat foto katalog), status, upload
supabase/                      9 migration SQL + tes SQL (isolasi, editor, publish, katalog, **simpan draft/konflik**, publish bersamaan)
tests/                         tes unit (node --test); tests/browser = harness Chromium (npm run test:browser)
brand/ public/icons            ikon RONA asli + turunan
scripts/                       check-secrets.mjs, test-db.sh, browser-check.sh, generate-icons.sh
```
`.env.local` **tidak** ada di ZIP; Anda membuatnya sendiri (langkah 4).

---

## Cache dan privasi
Halaman privat (`/dashboard`, `/onboarding`, `/login`, `/register`, `/auth/*`) dikirim dengan `Cache-Control: private, no-store` dan `noindex`; editor/preview `force-dynamic`. Halaman publik `/[username]` dirender statis (ISR, `revalidate = 3600` sebagai jaring pengaman) dengan **satu** panggilan RPC `get_public_page` tanpa cookie. Publish dan unpublish memanggil `revalidatePath("/<username>")` sehingga konten lama (termasuk 404 yang ter-cache) langsung dibuang. Katalog ikut snapshot yang sama (tidak ada cache terpisah; draft katalog tidak pernah masuk cache publik). Foto publik bernama acak dan immutable (`Cache-Control` 1 tahun). Mekanisme ini memakai API yang sama di Next 15 dan 16, tetapi **belum diverifikasi pada versi terpasang**: periksa dengan docs/manual-tests.md §3 (Menerbitkan) setelah deploy.

## Troubleshooting
| Gejala | Penyebab umum & solusi |
|---|---|
| "Konfigurasi Supabase tidak valid" | `.env.local` kosong/salah nama, URL tidak `https://`, atau kunci bukan anon/publishable. Perbaiki lalu restart `npm run dev`. |
| Variabel env tidak terbaca | Nama salah ketik, `.env.local` bukan di root, atau belum *Redeploy* di Vercel. |
| `npm install` gagal | Cek `node -v` (≥ 22.18), koneksi internet; kirim error pertama. Di CI: buka run di tab *Actions* → *Summary*. |
| Build gagal | Baca error pertama di log; jalankan `npm run typecheck` dan `npm run lint` lokal. |
| Peringatan "middleware is deprecated" (Next 16) | Aman; nama konvensi baru adalah `proxy`. Opsional: ganti `src/middleware.ts` menjadi `src/proxy.ts` dan nama fungsi `middleware` → `proxy` setelah memverifikasi versi. |
| Tautan konfirmasi gagal / "Tautan tidak valid" | URL belum ada di *Redirect URLs*; tautan dibuka di browser/perangkat lain (gunakan template `token_hash`, docs/supabase-test-project-verification.md §A.5); tautan kedaluwarsa. |
| RLS menolak / data kosong | Belum masuk, atau mengakses data pengguna lain (memang ditolak). Pastikan 9 migration (`docs/migrations.md`) sudah dijalankan berurutan. |
| Username "tidak tersedia" padahal baru | Dipakai pengguna lain atau termasuk daftar dicadangkan. |
| Migration gagal "already exists" | Tabel sudah ada; lihat langkah 5.1 dan jangan jalankan ulang file yang sudah sukses. |
| Halaman publik `/username` 404 padahal sudah terbit | Cache lama: tunggu/ulangi publish; pastikan migration 5 diterapkan dan `select public.get_public_page('username')` mengembalikan data. Pastikan `NEXT_PUBLIC_SUPABASE_*` terisi di Vercel. |
| Foto katalog gagal diunggah "terlalu besar"/galat 413 | Server Action dibatasi `experimental.serverActions.bodySizeLimit` (6 MB, `next.config.ts`); lokasi opsi ini belum diverifikasi pada versi Next terpasang. |
| Katalog tidak muncul di halaman publik | Pastikan section aktif, ada item *Tampilkan di halaman* dengan judul, dan Anda sudah **menerbitkan** setelah menambah item. Migration 6 harus diterapkan. |
| Galat `40P01` / "deadlock detected" saat simpan bersamaan dengan terbit | Migration 9 belum diterapkan (urutan kunci `save_draft` lama). Terapkan `20261023000000_phase8_hardening.sql`. |
| "permission denied for table pages/profiles" pada kode kustom Anda | Sejak migration 9 client tidak boleh INSERT/DELETE langsung pada `pages`/`profiles`; gunakan `claim_profile()` dan RPC yang ada. |
| Terbit gagal "Item katalog … belum valid" | Buka item tersebut, perbaiki isian yang ditandai (mis. CTA), simpan, terbitkan lagi. |
| Terbit gagal "Gambar belum berhasil disalin" | Bucket `public-assets` belum ada/policy storage (migration 2) belum diterapkan, atau gambar draft hilang: unggah ulang gambarnya. |
| Gambar tidak tampil di halaman publik | Bucket `public-assets` harus **publik**; periksa URL `…/storage/v1/object/public/public-assets/<uid>/…`. Belum diuji ke Storage asli. |
| Halaman masih menampilkan versi lama setelah terbit | `revalidatePath` belum bekerja di versi Next Anda; hard-refresh, lalu periksa log Vercel. Ini risiko yang belum diverifikasi. |
| "permission denied for function publish_page" | Disengaja (migration 5): terbitkan lewat tombol Terbitkan, bukan memanggil `publish_page()` langsung. |
| "Username tidak dapat diubah selama halaman diterbitkan" | Aturan Phase 3 yang **dicabut di Phase 7**. Bila masih muncul, migration 8 belum diterapkan. |
| "Username ini baru saja dilepas pemiliknya" | Karantina 30 hari (Phase 7): nama yang dilepas hanya bisa diambil kembali oleh pemilik sebelumnya. |
| Ganti email: email aktif belum berubah | Normal: berubah hanya setelah Anda mengonfirmasi lewat tautan di email (dan email lama bila *Secure email change* aktif). Status "Menunggu konfirmasi" tampil di tab Akun. |
| Tautan konfirmasi ganti email / atur ulang kata sandi gagal | `…/auth/callback` belum ada di *Redirect URLs*, atau `NEXT_PUBLIC_SITE_URL` salah/kosong. Lihat bagian 11. |
| Pratinjau tautan (WhatsApp/X) masih lama setelah ubah SEO | SEO ikut Publish: terbitkan lagi. Platform sosial juga menyimpan cache pratinjau sendiri. |
| Unggah gambar gagal "Body exceeded 1 MB" | Opsi `experimental.serverActions.bodySizeLimit` di `next.config.ts` belum dikenali versi Next Anda; pindahkan ke lokasi yang benar sesuai dokumentasi versi terpasang. |
| Unggah gagal "izin" / "row-level security" | Migration 2 (policy storage) belum diterapkan, atau bucket `draft-assets` belum ada. |
| Gambar tidak tampil di editor | URL bertanda tangan berlaku 1 jam; muat ulang halaman. Pastikan bucket `draft-assets` tetap **privat**. |
| "Daftar tautan berubah di tempat lain" saat mengurutkan | Tab/perangkat lain mengubah daftar; muat ulang halaman lalu urutkan lagi. |
| "Jumlah tautan sudah mencapai batas (50)" | Batas MVP; hapus tautan yang tidak dipakai. |
| "Draft ini sudah diubah dari tab atau perangkat lain" | Perlindungan konflik (Phase 6): ada versi draft yang lebih baru dari yang Anda lihat. Perubahan Anda tidak hilang di layar; klik *Muat ulang versi terbaru* lalu terapkan ulang. |
| Editor gagal dimuat setelah deploy Phase 6 / galat kolom `profile_rev` atau `settings_rev` | Migration 7 belum diterapkan. Terapkan `20261019000000_phase6_draft_save.sql`, lalu muat ulang. |
| Lint gagal pada konfigurasi | Pastikan `eslint-config-next` versi 16; `next lint` sudah dihapus di Next 16, pakai `npm run lint`. |

## Aturan penting
- Jangan menaruh service-role key atau secret di kode klien atau Git.
- Jangan mengubah `brand/rona-icon-source.png` (lihat `brand/ASSETS.md`).
- Setiap tabel baru di schema `public` wajib RLS + policy + tes isolasi.
