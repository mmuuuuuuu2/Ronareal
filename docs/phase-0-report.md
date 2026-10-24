# RONA — Laporan Phase 0 (16 Okt 2026)

**Status jujur:** Phase 0 **belum selesai**. Fondasi database, keamanan, aset brand, dan dokumentasi sudah dibuat dan diuji. Aplikasi Next.js **belum di-scaffold** karena registry npm tidak terjangkau dari lingkungan kerja ini (lihat butir 10). Tidak ada deployment; aplikasi belum online.

## 1. Audit repository
- Workspace kosong: bukan repo Git, tidak ada `package.json`, kode, dependency, konfigurasi, atau dokumentasi sebelumnya. Tidak ada yang rusak/duplikat/bertentangan karena tidak ada apa-apa. Tidak ada kode yang dihapus atau ditimpa.
- Lingkungan: Node v22.22.0, npm 10.9.4, pnpm & yarn tersedia, Postgres 16 (server + psql) tersedia, ImageMagick 6, Python+Pillow. Docker tidak berjalan.
- Teknologi yang diminta (Next.js, TS, Tailwind, Supabase): **belum terpasang** — dokumen mengatakan "proyek kosong → siapkan fondasi".

## 2. Blueprint
- Ditemukan: 1 dokumen (`attachment.txt`, instruksi Phase 0) dan 1 gambar (icon RONA).
- Belum tersedia: blueprint fitur terperinci, wireframe, kebijakan produk (mis. aturan ganti username, kebijakan unpublish), copywriting, daftar ikon CTA.

## 3. Arsitektur yang direkomendasikan
- Next.js App Router. Rute publik `/[username]` dan `/[username]/services`; rute sistem (`/login`, `/register`, `/dashboard`, `/api`, dst.) dilindungi lewat tabel `reserved_usernames`.
- Pembacaan publik hanya lewat RPC `get_public_page(username)` (membaca snapshot terbit), dibungkus cache Next bertag per username (`revalidateTag` saat publish/unpublish). Draft dan preview selalu dinamis, tanpa cache, dengan `noindex` dan `robots: noindex`.
- Tulis dilakukan dengan sesi pengguna (anon key + JWT) di bawah RLS. Tidak ada service-role key di aplikasi.
- Gambar: unggah ke bucket privat `draft-assets/<uid>/…`; saat publish, server menyalin ke `public-assets/<uid>/…`, mengisi kolom `*_published_path`, lalu memanggil `publish_page()`.
- Motion: bungkus aplikasi dengan `<MotionConfig reducedMotion="user">`.

## 4. Keputusan teknis & asumsi
- Satu halaman per pengguna di MVP (`pages.owner_id` unik). Multi-halaman bisa menyusul via migration.
- Username: 3–30 karakter, huruf kecil/angka/`_`/`-`, tidak diawali/diakhiri `_`/`-`, unik, tidak boleh reserved. **Asumsi:** kebijakan ganti username belum ditentukan (mengubahnya memutus URL lama).
- `cta_*` bernilai NULL = belum dikustomisasi; default diterapkan saat render sehingga tidak menimpa nilai yang sengaja diisi.
- Maks 7 gambar per item dipaksa di database (posisi 0–6, unik).
- Format gambar yang diizinkan: JPEG/PNG/WebP, maks 5 MB (di level bucket). SVG sengaja tidak diizinkan (risiko XSS).
- Tanpa panel/peran Admin.
- Kunci Supabase: nama "anon" vs "publishable" perlu diverifikasi di dashboard proyek.

## 5. Struktur direktori
```
rona/
├── brand/            rona-icon-source.png (+ .sha256), ASSETS.md
├── docs/             phase-0-report.md
├── public/icons/     turunan icon (dihasilkan)
├── scripts/          generate-icons.sh, test-db.sh
├── src/
│   ├── app/          (belum ada — menunggu scaffold) [username]/, dashboard/, login/, register/
│   ├── components/   rona-mark, ui, link-card, catalog, editor
│   ├── lib/          supabase/{client,server}, validation, cta, publish
│   └── styles/       tokens.css
└── supabase/
    ├── migrations/   20261016000000_foundation.sql
    └── tests/        shim_supabase.sql, rls_isolation.sql
```
Yang **sudah ada**: `brand/`, `docs/`, `public/icons/`, `scripts/`, `src/styles/tokens.css`, `src/app/favicon.ico`, `supabase/`. Sisanya rencana.

## 6. Database & keamanan (sudah dibuat)
Tabel: `profiles`, `pages` (draft_config jsonb), `page_links`, `catalog_items`, `catalog_images`, `published_snapshots` (immutable), `reserved_usernames`. RLS aktif di ketujuhnya.
- Kepemilikan lewat `auth.uid()`; `owner_id` dari browser tidak dipercaya (policy `with check`). Anak tabel memeriksa kepemilikan via join ke `pages`.
- `anon` tidak punya akses tabel sama sekali. Baca publik hanya via `get_public_page()` (security definer, hanya snapshot live).
- `pages.is_published`/`published_snapshot_id` tidak bisa diubah client; hanya `publish_page()` / `unpublish_page()`. `publish_page()` atomik: gagal → rollback, versi live sebelumnya tetap; menolak bila ada gambar tanpa salinan publik.
- Storage: `draft-assets` privat, `public-assets` publik-baca; tulis hanya ke folder `<uid>/` milik sendiri.
- Constraint panjang/ukuran/format di database, selain validasi server yang akan ditulis di Phase 1.

## 7. Strategi icon
Lihat `brand/ASSETS.md`. Satu file sumber asli, turunan dihasilkan skrip (resize saja), tanpa SVG palsu, tidak dipaksakan ke konten pengguna.

## 8. Rencana fase
1. **Phase 0 (sisa):** scaffold Next.js + dependency, `<RonaMark />`, manifest/metadata, build produksi hijau, README final.
2. **Phase 1:** Auth (register/login), klaim username, app shell dashboard, klien Supabase SSR.
3. **Phase 2:** Editor link page (draft), unggah gambar, pengaturan kartu per item.
4. **Phase 3:** Preview privat (`noindex`), publish/unpublish, cache bertag, halaman publik `/[username]`.
5. **Phase 4:** Katalog (`/services`, carousel, pengurutan, banner CTA).
6. **Phase 5:** CTA (WhatsApp/URL/email/telepon), PWA, performa & Core Web Vitals diukur.
7. **Phase 6:** Hardening, deployment Vercel, domain.

## 9. Environment variables
Lihat `.env.example`: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` sengaja tidak dipakai.

## 10. Risiko & hal yang harus diverifikasi
- **Pemblokir:** `registry.npmjs.org` ada di daftar `noProxy` lingkungan dan gagal DNS saat diakses langsung (`ENOTFOUND`); proxy egress yang tersedia tidak dipakai untuk host itu. Dua percobaan gagal (create-next-app, `npm view`). Saya tidak mengubah konfigurasi proxy. Akibatnya: versi aktual Next/Tailwind/Motion/Supabase **belum diverifikasi**, dan tidak ada `package.json` yang ditulis dengan menebak versi.
- Tes database berjalan di Postgres + shim, **bukan Supabase asli**; perilaku `storage.*`, `auth.*` asli, dan kunci API harus diuji ulang dengan `supabase start`.
- Policy storage belum diuji sama sekali (shim `storage.objects` hanya stub).
- Validasi MIME di bucket tidak memeriksa magic bytes; validasi server (ukuran, tipe, dimensi) tetap wajib.
- Rate limiting pendaftaran/unggahan/klaim username belum dirancang.
- Icon sumber: sudut hitam solid dan tanpa alpha (lihat `brand/ASSETS.md`). Palet UI (porcelain terang) berbeda dari ikon (indigo–violet gelap); perlu keputusan apakah ada warna aksen brand.
- Domain, URL redirect Supabase Auth, dan konfigurasi Vercel: dokumentasi menyusul di README setelah scaffold; belum ada yang dikonfigurasi.
- Core Web Vitals: belum bisa diukur (belum ada aplikasi).

## 11. Hasil pengujian yang benar-benar dijalankan
- `bash scripts/test-db.sh` (Postgres 16 sementara + shim): migration diterapkan tanpa error; RLS aktif di 7/7 tabel; **29 pemeriksaan PASS, 0 FAIL**, mencakup: B tidak bisa baca/ubah/hapus data draft A; B tidak bisa insert atas nama A (profil, page, link, gambar); `is_published` dan snapshot tidak bisa ditulis langsung; username reserved/duplikat/format salah ditolak; gambar ke-8 ditolak; `anon` ditolak pada semua tabel dan pada `publish_page`; publish gagal tidak meninggalkan snapshot dan tidak merusak versi live; edit draft tidak mengubah halaman live; unpublish menghentikan akses publik; payload publik tidak memuat field internal.
- Ikon: 6 ukuran + `favicon.ico` (16/32/48) dihasilkan dan dicek ukuran & mode (PNG24). Belum diperiksa secara visual di browser.
- **Tidak dijalankan:** lint, typecheck, production build, tes UI/E2E, tes performa, deployment.
