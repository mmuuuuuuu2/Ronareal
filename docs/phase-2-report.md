# RONA — Laporan Phase 2 (Application Core & Authentication) — **PARTIAL**

Paket: `RONA_Phase_2_Application_Core.zip`. Status PARTIAL karena aplikasi belum pernah di-install, di-build, atau dijalankan (npm dan host Supabase tidak terjangkau dari lingkungan kerja).

## Audit Phase 1 (sebelum coding)
- Phase 1 berisi: 2 migration, aset brand, dokumentasi, runner tes DB; **tidak ada aplikasi Next.js** (sesuai laporan Phase 1).
- Ditemukan di workspace saat audit, **tidak dibuat oleh saya pada Phase 1**: migration `20261016020000_phase2_claim_profile_reserved.sql` (fungsi `claim_profile`, username reserved tambahan), `supabase/tests/phase2_claim_profile.sql`, modul `src/lib/{auth/errors,supabase/key-check,validation/*}.ts`, dan 5 berkas `tests/*.test.ts`. Isinya dibaca penuh, konsisten dengan kontrak skema Phase 1, dan dipertahankan; semuanya dijalankan dan lulus (lihat di bawah). Tes anti-drift memastikan pola username TS identik dengan pola di SQL.
- Tidak ada konflik skema: migration baru hanya menambah (INSERT ON CONFLICT DO NOTHING, fungsi baru); migration 1 dan 2 tidak diubah. `claim_username()` tetap ada demi kompatibilitas; aplikasi memakai `claim_profile()`.
- Perubahan kecil: token `--rona-fg-muted` dinaikkan ke 72% agar kontras teks ≥ 4,5:1.

## Dibuat
- **Konfigurasi:** `package.json` (tanpa lockfile), `tsconfig.json` (strict + `noUncheckedIndexedAccess`), `next.config.ts` (header keamanan, `no-store` untuk rute privat), `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`.
- **Auth:** klien Supabase server-only (tanpa klien browser), middleware penyegar sesi memakai `getUser()`, pagar route murni, login/registrasi/logout (server actions dengan validasi ulang), callback (PKCE `code` dan `token_hash`), pemetaan error yang tidak membocorkan keberadaan email.
- **Onboarding:** nama tampilan + username; cek ketersediaan via RPC `is_username_available` (debounce 450 ms, hanya bila format valid, hasil basi diabaikan); penyimpanan atomik via RPC `claim_profile`; `/dashboard` mengalihkan ke `/onboarding` bila profil belum ada.
- **Dashboard:** profil, username, status onboarding, kartu halaman personal dengan status jujur, tombol editor dinonaktifkan ("belum tersedia"), logout berfungsi.
- **Desain:** landing, kartu kaca hemat (blur 14px), palet dari spesifikasi, font sistem (tanpa unduhan font), satu animasi pembuka hero dengan `prefers-reduced-motion`.
- **Alat:** `scripts/check-secrets.mjs`, tes `env` dan `route-guard`, runner `test-db.sh` kini menjalankan 3 berkas tes SQL.

## Pengujian yang benar-benar dijalankan
| Pemeriksaan | Hasil |
|---|---|
| `node --test tests/*.test.ts` (Node 22.22) | 28 lulus, 0 gagal. Mencakup validasi username/email/password/nama tampilan, anti open-redirect, pemetaan error, pemeriksa kunci (service_role/secret ditolak), parsing env, pagar route, anti-drift pola SQL |
| `bash scripts/test-db.sh` (Postgres 16 sementara + shim, **bukan Supabase asli**) | 3 migration diterapkan tanpa error; 68 pemeriksaan PASS, 0 FAIL: isolasi A vs B (tabel + storage), klaim username/profil atomik, validasi aset saat publish, publish gagal tidak merusak versi live, anon ditolak |
| `tsc` 6.0.3 strict pada seluruh `src/**` dan `tests/**` dengan **stub tipis** untuk paket eksternal | 0 galat. Membuktikan konsistensi internal (impor, ekspor, tipe state); **bukan** kecocokan dengan tipe asli Next/React/Supabase |
| `node scripts/check-secrets.mjs` | Bersih. Tidak ada JWT/`sb_secret_`/service-role di kode; tidak ada klien Supabase browser; `.env.example` kosong; `.env.local` di-git-ignore |
| Struktur: `package.json` valid, berkas konfigurasi ada, file `"use server"` hanya mengekspor fungsi async, `"use client"` hanya pada 7 komponen interaktif | Lulus |

## Tidak dapat dijalankan (alasan)
- `npm install`, lockfile, `npm run build`, `npm run lint`, type-check dengan paket asli: `registry.npmjs.org` tidak terjangkau (ENOTFOUND; bypass proxy via `noProxy`). ESLint global ada tetapi tanpa `eslint-config-next`.
- Registrasi, login, logout, callback, onboarding, dashboard terhadap Supabase asli: `zaoppiyawthfvfxtlnjd.supabase.co` ditolak proxy egress (403, kebijakan). Tidak ada mock yang dipakai untuk mengklaim Auth berhasil.
- Uji UI/E2E, performa, Core Web Vitals, deployment Vercel: aplikasi belum bisa dijalankan.

## Status integrasi Supabase aktual
- Konfigurasi: format URL dan kunci anon diperiksa (Phase 1). Koneksi **belum** diuji.
- Migration 1–3: **hanya disiapkan**; diuji di Postgres lokal; **belum diterapkan** ke proyek Anda.
- RLS/Storage: diuji di shim; belum diverifikasi terhadap Supabase asli.

## Kesiapan Vercel
Belum siap dinyatakan: build belum pernah berhasil. Setelah `npm install` + `npm run build` sukses di komputer Anda, deploy mengikuti README.

## Known issues & risiko
1. Versi paket adalah rentang yang disusun dari pengetahuan, belum diverifikasi; `npm install` bisa meminta penyesuaian.
2. `src/middleware.ts`: Next 16 menamai konvensi ini `proxy` (middleware deprecated tetapi masih berjalan). Dipilih agar jalan di Next 15 dan 16; kemungkinan muncul peringatan deprecation.
3. Middleware memanggil `getUser()` (ke server Auth) pada rute privat: aman tetapi menambah satu panggilan per navigasi. Optimasi (`getClaims`) ditunda sampai versi pustaka diverifikasi.
4. Tautan konfirmasi alur PKCE hanya berfungsi di browser yang sama dengan saat mendaftar; template `token_hash` (README 5.4) mengatasinya dan sudah didukung callback.
5. Belum ada tipe database hasil `supabase gen types`; tipe baris ditulis manual dan minimal.
6. Ikon sumber bersudut hitam solid; ditampilkan dengan radius CSS (file asli tidak diubah). Minta versi bersudut transparan dari desainer bila perlu.
7. Tanpa rate limiting di aplikasi (mengandalkan Supabase Auth); CSP ketat ditunda ke fase hardening.
8. Cek username membuka peluang enumerasi terbatas (hanya untuk pengguna masuk); wajar bagi layanan seperti ini.

## Langkah berikutnya (Phase 3)
Verifikasi dulu: `npm install`, `npm run check`, `npm run build`, terapkan migration ke proyek uji, uji alur manual README 6. Lalu: editor halaman (draft), unggah gambar ke `draft-assets`, preview privat, publish/unpublish, dan halaman publik `/[username]`.
