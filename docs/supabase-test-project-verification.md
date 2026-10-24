# Prosedur verifikasi di proyek Supabase UJI

Tujuan: membuktikan Auth, RLS, Storage, RPC, publish/unpublish, username, dan cache terhadap Supabase **asli**.
Semua langkah di sini **belum pernah dijalankan** (lingkungan pembuatan tidak punya akses ke Supabase). Hasil tes SQL lokal
memakai Postgres + shim, bukan Supabase asli.

**Aturan:** pakai proyek **baru khusus uji** (bukan proyek produksi). Jangan menempelkan service-role key ke chat, repo, atau `.env.local`
aplikasi. Tes yang membuat akun (`auth.users`) hanya untuk proyek uji.

## A. Persiapan
1. Supabase Dashboard → *New project* (nama mis. `rona-test`). Catat Project URL dan anon key (Project Settings → API).
2. **Backup tidak perlu** untuk proyek kosong; untuk proyek yang sudah berisi data: *Database → Backups* / `pg_dump` dulu.
3. Terapkan migration **berurutan** lewat SQL Editor (satu berkas per eksekusi), atau `supabase db push` dari folder project:
   `20261016000000_foundation` → `…010000_phase1_onboarding_assets` → `…020000_phase2_claim_profile_reserved` → `…030000_phase3_editor` →
   `…040000_phase4_publish` → `…050000_phase5_catalog` → `20261019000000_phase6_draft_save` → `20261021000000_phase7_account_page_settings` → `20261023000000_phase8_hardening`.
   Berhenti di galat pertama dan kirim pesannya apa adanya.
4. Jalankan `supabase/verify/schema_check.sql` di SQL Editor. **Semua baris harus `ok = true`.** Baris `false` = penyimpangan; jangan lanjut.
5. **Authentication → URL Configuration:**
   - *Site URL* = nilai `NEXT_PUBLIC_SITE_URL` (lokal: `http://localhost:3000`; Vercel: `https://<nama>.vercel.app`).
   - *Redirect URLs* (daftar putih; semua harus ada): `http://localhost:3000/auth/callback`, `https://<nama>.vercel.app/auth/callback`. Untuk branch `staging`: tambahkan alias tetapnya. Opsional wildcard Supabase: `https://*-<tim>.vercel.app/**` (hanya di proyek uji).
   - *Authentication → Providers → Email*: *Confirm email* **aktif** untuk uji realistis (boleh dimatikan hanya di proyek uji untuk uji cepat); *Secure email change* aktif (bawaan); *Secure password change* sesuai kebutuhan.
   - *Authentication → Email Templates*: pastikan *Confirm signup*, *Change Email Address*, *Reset Password* ada. Agar tautan dapat dibuka di perangkat lain, pakai pola `token_hash` (callback menerima `type=email`, `email_change`, `recovery`), mis. Confirm signup: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
   - SMTP bawaan Supabase dibatasi laju kirim; pakai SMTP sendiri untuk uji berulang/produksi.
6. **Storage:** setelah migration 2, pastikan dua bucket ada: `draft-assets` (privat) dan `public-assets` (publik), keduanya batas 5 MB dan MIME `image/jpeg`, `image/png`, `image/webp`. Jangan membuat/mengubah bucket atau policy lewat Dashboard (migration + `schema_check.sql` adalah sumber kebenaran).
7. **RLS:** `schema_check.sql` harus menunjukkan RLS aktif di 8 tabel dan tidak ada hak tulis anon. Jangan mematikan RLS untuk "memperbaiki" galat; kirim galatnya.
8. **Variabel environment aplikasi:** hanya `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (kunci anon/publishable), `NEXT_PUBLIC_SITE_URL`. **Jangan** memakai atau membagikan service-role / `sb_secret_` key — aplikasi menolaknya saat start dan tidak membutuhkannya.

## B. Tes SQL asli (RLS + RPC)
Hanya untuk proyek uji lokal/uji. Opsi paling aman: Supabase lokal (`supabase start`) lalu
`psql "<db-url-lokal>" -f supabase/tests/rls_isolation.sql` dan `phase1…phase8_*.sql` (tanpa `shim_supabase.sql`; semua memakai transaksi + `ROLLBACK`).
Jangan jalankan `phase4_concurrency_*`, `phase6_parallel_*`, `phase7_race_*`, `phase8_lock_*` di proyek bersama: berkas itu meng-commit data (khusus `scripts/test-db.sh`).
Catat jumlah PASS/FAIL per berkas.

## C. Tes manual lewat aplikasi (setelah deploy ke Preview/`localhost` dengan proyek uji)
| # | Area | Langkah | Hasil yang diharapkan |
|---|---|---|---|
| 1 | Auth | Daftar akun A, konfirmasi email, masuk | Onboarding → klaim username → dashboard |
| 2 | Auth | Keluar lalu buka `/dashboard` | Dialihkan ke login |
| 3 | RLS | Daftar akun B. Di Network tab/`supabase-js` console coba `from('pages').select()` | Hanya baris milik B |
| 4 | RLS | Sebagai B coba `from('pages').delete()` / `insert()` | Ditolak (hak dicabut migration 9) |
| 5 | RLS | Sebagai B coba `rpc('publish_page', …)` | Ditolak (permission denied) |
| 6 | Username | `is_username_available` tanpa login (curl anon key) | Ditolak (migration 9) |
| 7 | Username | Ubah username A saat halaman terbit | Langsung berlaku; URL lama 404; nama lama terkarantina 30 hari bagi akun lain |
| 8 | Storage | Unggah avatar JPG/PNG/WebP < 5 MB | Berhasil; draft privat |
| 9 | Storage | Unggah `.svg`/`.gif`/> 5 MB (via UI & curl) | Ditolak (MIME/ukuran bucket) |
| 10 | Storage | Sebagai B tulis ke path `<uidA>/avatar/x.png` | Ditolak oleh policy |
| 11 | Draft vs publish | Terbitkan, ubah draft tanpa terbit, buka halaman publik di jendela privat | Publik tetap versi lama; pratinjau = draft |
| 12 | Gagal terbit | Hapus objek aset draft lewat Dashboard Storage, klik Terbitkan | Gagal dengan pesan jelas; halaman publik tetap versi sebelumnya |
| 13 | Unpublish | Batalkan penerbitan, lalu terbitkan ulang | 404 saat tidak terbit; kembali normal setelah republish |
| 14 | Konflik | Buka editor di 2 tab; simpan di tab 1 lalu tab 2 (usang) | Tab 2 ditolak dengan pesan konflik; katalog tidak tertimpa |
| 15 | Cache/ISR | Terbitkan perubahan; muat `/<username>` di jendela privat | Perubahan terlihat segera (`revalidatePath`); bila tidak, catat — ISR belum terbukti |
| 16 | SEO | Lihat sumber halaman publik | `<title>`, `canonical` = `NEXT_PUBLIC_SITE_URL`/username, OG tags; validasi di opengraph debugger |
| 17 | Email | Ganti email & atur ulang kata sandi | Tautan email membuka `/auth/callback` lalu `/dashboard/settings` |
| 18 | Isolasi | Dua akun, dua browser: edit bersamaan | Tidak ada data bocor antar akun |

## D. Setelah lulus
Ulangi `schema_check.sql`, lalu catat hasil (tanggal, versi migration, versi Node/npm, hasil tiap baris tabel C) ke `docs/production-readiness-report.md` bagian "Hasil verifikasi Anda". Baru setelah itu pertimbangkan proyek produksi — dengan backup dan persetujuan Anda sendiri.
