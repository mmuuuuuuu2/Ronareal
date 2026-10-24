# Laporan Phase 7 — Akun, Username & Pengaturan Halaman

**Status akhir: PARTIAL.** Semua fitur Phase 7 sudah ditulis dan diuji dengan alat yang tersedia di lingkungan kerja (Postgres lokal + shim, Chromium nyata dengan server action berupa stub, `node --test`). Yang **tidak** dapat dijalankan di sini: `npm install`/`build`/`lint` asli, Supabase asli (Auth, email, Storage, RPC), Next asli (ISR/`revalidatePath`/`generateMetadata`), perangkat nyata. Tidak ada klaim sebaliknya di bawah.

## 1. Temuan audit Phase 0–6 yang memengaruhi Phase 7
| Temuan | Dampak | Penanganan |
|---|---|---|
| `change_username()` menolak saat terbit (`username_locked_published`) | Bertentangan dengan kebutuhan Phase 7 | Dicabut (migration 8). Pengunci aslinya melindungi konsistensi snapshot ↔ URL, jadi diganti perbaikan di bawah |
| Snapshot menanam `profile.username`; `get_public_page` mencari berdasarkan username profil **saat ini** | Setelah ganti username, URL baru menampilkan @handle/canonical/CTA berisi nama lama | `get_public_page` menimpa `profile.username` dengan nilai profil saat ini (hanya dari snapshot + username; tidak membaca draft) |
| `get_publish_state` membandingkan draft vs snapshot termasuk username | Ganti username tampak "ada perubahan belum terbit" padahal berlaku langsung | Perbandingan memakai snapshot dengan username profil saat ini |
| Username lama langsung bisa diambil orang lain | Risiko menyerobot/meniru URL yang sudah dibagikan | Karantina 30 hari (`username_released`) |
| Ganti username tidak menaikkan `profile_rev` | Tab editor usang bisa **diam-diam mengembalikan** username lama lewat `save_draft` | `change_username` menaikkan `profile_rev` → tab usang mendapat `draft_conflict_profile` |
| `CopyUrl` memakai origin peramban; `registerAction` memakai header `origin` sebagai cadangan | Canonical/URL tidak tepercaya | Origin tepercaya hanya dari `NEXT_PUBLIC_SITE_URL` (`resolveSiteUrl`); di produksi tanpa konfigurasi → tidak ada URL absolut (relatif) |
| Editor memuat field username yang bisa diubah | Dua tempat mengubah satu data | Di editor kini read-only + tombol ke Pengaturan (sumber tunggal) |
| `CopyUrl` memakai `id="public-url"` tetap | Duplikat id saat dua instans di halaman | `useId()` |

## 2. Fitur
**Selesai (kode + tes alternatif):** halaman `/dashboard/settings` (5 tab); ubah nama profil; status email (menunggu konfirmasi dari `new_email`); permintaan ganti email; ubah kata sandi; kirim tautan atur ulang ke email sendiri; keluar (existing) + keluar dari perangkat lain; ubah username (validasi server, cek ketersediaan debounce 500 ms, konfirmasi saat terbit, invalidasi URL lama+baru); deskripsi halaman (bio); SEO (judul, deskripsi, judul/deskripsi berbagi, gambar berbagi avatar/latar/tanpa, jenis kartu, canonical otomatis, pratinjau); metadata publik dari data terbit; status & publish/unpublish memakai `publishAction`/`unpublishAction` Phase 4 (tidak ada fungsi publish kedua); tautan "Pengaturan" di navigasi dan ringkasan.

**Belum / tidak dikerjakan (disengaja atau tidak terjangkau):** hapus akun permanen (dilarang spesifikasi; keluar ≠ hapus); redirect otomatis dari username lama (tidak ada: URL lama = 404, didokumentasikan); verifikasi email/reset terhadap Supabase asli; `noindex` per halaman; pratinjau gambar OG di UI.

## 3. Rute
| Rute | Status |
|---|---|
| `/dashboard/settings?tab=akun\|username\|halaman\|seo\|status` | **Baru** (dinamis, dijaga sesi, di bawah prefiks `/dashboard` yang sudah dilindungi middleware) |
| `/auth/callback` | Diubah: menerima tipe OTP `email_change` dan `recovery` selain yang lama; `next` tetap lewat `safeNextPath` |
| `/[username]` | Diubah: `generateMetadata` lewat `buildPageMetadata` (SEO + canonical tepercaya) |
| `/dashboard` | Diubah: tautan Pengaturan; `CopyUrl` memakai origin tepercaya |

## 4. File
**Baru:** `supabase/migrations/20261021000000_phase7_account_page_settings.sql`; `supabase/tests/phase7_account_settings.sql`, `phase7_race_setup.sql`, `phase7_race_check.sql`; `src/app/dashboard/settings/{page.tsx,actions.ts}`; `src/components/settings/*` (shell, account/username/page/seo/status, use-saver, section-parts); `src/lib/seo/{seo,metadata}.ts`; `src/lib/account/account.ts`; `src/lib/settings/{load,tabs}.ts`; `src/lib/site.ts`; `tests/{seo,account-settings}.test.ts`; `tests/browser/{entry-settings.tsx,settings.html,run-settings.cjs,stubs/settings-actions.ts}`.
**Diubah:** `src/lib/env.ts` (+`resolveSiteUrl`), `src/lib/publish/snapshot.ts` (meta dari `resolveMeta`), `src/lib/auth/errors.ts` (konteks akun), `src/lib/editor/errors.ts`, `src/lib/editor/action-types.ts`, `src/app/[username]/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/dashboard/{layout,page}.tsx`, `src/components/editor/profile-panel.tsx`, `src/components/publish/copy-url.tsx`, `src/components/ui/text-field.tsx` (hint dapat berupa node), `scripts/test-db.sh`, `scripts/browser-check.sh`, `tests/browser/{build.mjs,stubs/actions.ts,stubs/auth-actions.ts}`, `supabase/tests/phase{3,4,6}_*.sql` (asersi "username terkunci" diubah menjadi asersi perilaku baru; migration lama **tidak** diubah), README.

## 5. Migration
**Urutan lengkap:** 1 `20261016000000_foundation` → 2 `…010000_phase1_onboarding_assets` → 3 `…020000_phase2_claim_profile_reserved` → 4 `…030000_phase3_editor` → 5 `…040000_phase4_publish` → 6 `…050000_phase5_catalog` → 7 `20261019000000_phase6_draft_save` → **8 `20261021000000_phase7_account_page_settings`**.
Migration 8: aditif, idempoten (`if not exists`, `create or replace`), tanpa DROP/rename/penghapusan data. **Tidak diterapkan otomatis ke Supabase mana pun.** Bandingkan dulu dengan skema proyek Anda (README §5), coba di proyek uji, dan terapkan sebelum deploy kode Phase 7.

| Objek | Perubahan |
|---|---|
| `username_released` (tabel baru) | karantina; RLS aktif **tanpa policy**; hak akses dicabut dari `anon`/`authenticated` |
| `enforce_username_rules()` (trigger) | + karantina 30 hari untuk pemilik lain; mencatat nama yang dilepas |
| `is_username_available`, `change_username`, `get_public_page`, `get_publish_state` | `create or replace`, **tanda tangan sama** (RPC/action lama tetap kompatibel) |
| `pages.seo_rev` | kolom baru; client tidak bisa menulisnya (hanya RPC) |
| `save_seo(jsonb, int)` | baru; validasi di DB (panjang, enum, karakter kontrol, kunci tak dikenal ditolak), cek revisi, hanya menyentuh `draft_config.seo` |
| `update_profile_fields(jsonb, int)` | baru; nama/bio parsial + cek `profile_rev`; username tidak bisa lewat sini |

SEO disimpan di `pages.draft_config.seo` (tidak ada tabel duplikat) sehingga otomatis ikut `build_draft_payload` (deteksi perubahan) dan snapshot saat Publish (alur Phase 4 tunggal). `save_draft` (Phase 6) mem-merge hanya `version`+`settings`, jadi tidak menghapus `seo` (diuji).

**Keputusan sumber tunggal:** nama/bio = `profiles` (revisi `profile_rev`); username = `profiles.username` (kunci URL, berlaku langsung); SEO = `draft_config.seo` (revisi `seo_rev`); tampilan/katalog/link tetap milik editor (tidak diduplikasi).

## 6. Perilaku penting
- **Username berlaku langsung** (bukan bagian draft): URL baru melayani snapshot yang sama dengan username baru; URL lama → 404. Isi halaman tidak berubah sampai Publish. Tidak ada redirect otomatis (kebijakan: tidak ada pengalihan permanen tanpa keputusan pemilik produk).
- **Cache:** `changeUsernameAction` memanggil `revalidatePath` untuk URL lama dan baru + dashboard/settings. Simpan SEO/nama/bio (draft) **tidak** meng-invalidasi `/username` (halaman publik tidak berubah sebelum Publish); `publishAction`/`unpublishAction` Phase 4 tetap meng-invalidasi. Halaman publik tetap tanpa `cookies()`/`headers()` (dijaga tes kontrak). **Perilaku ISR/`revalidatePath` di Next asli belum diverifikasi.**
- **Metadata:** hanya dari snapshot terbit. Gambar berbagi hanya dari path publik berpola baku (`publicAssetUrl`), tidak pernah dari draft atau URL bebas. Canonical/OG url dari `NEXT_PUBLIC_SITE_URL`; tanpa itu di produksi → canonical relatif (bukan header Host). Default tanpa "undefined"/"null". Kartu besar tanpa gambar turun ke `summary`.
- **Konflik:** tiga revisi terpisah (`profile_rev`, `settings_rev`, `seo_rev`); simpan usang ditolak dengan pesan jelas, **isian tidak dihapus**, tombol muat ulang. Username & ganti nama memakai `profile_rev` sehingga tab editor usang tidak bisa mengembalikan username lama.
- **Akun:** email aktif berubah hanya setelah Supabase mengonfirmasi (status dibaca dari `new_email`); kata sandi hanya diteruskan ke Supabase Auth (tidak disimpan/dicatat/dikembalikan; dites tidak muncul di log panggilan); atur ulang selalu ke email akun sesi, bukan dari client; pesan galat tidak membocorkan keberadaan email.

## 7. Konfigurasi Supabase Auth yang dibutuhkan (belum diuji ke Supabase asli)
1. *URL Configuration*: Site URL = URL produksi; *Redirect URLs* memuat `<NEXT_PUBLIC_SITE_URL>/auth/callback`.
2. `NEXT_PUBLIC_SITE_URL` terisi di Vercel (Production **dan** Preview) — dipakai untuk canonical dan `redirectTo`.
3. *Email Templates*: *Change Email Address* dan *Reset Password* aktif; untuk membuka di perangkat lain pakai pola `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change|recovery&next=/dashboard/settings`.
4. *Secure email change* (bawaan aktif → kedua email perlu konfirmasi; UI menjelaskan). *Secure password change* bila aktif dapat meminta masuk ulang (pesan sudah dipetakan).
5. SMTP: bawaan Supabase dibatasi laju; gunakan SMTP sendiri untuk produksi.

## 8. Cara menjalankan
`npm install` → isi `.env.local` → terapkan migration 1–8 → `npm run dev` → `/dashboard/settings`. Tes: `npm test`; `npm run test:db` (butuh Postgres 16 lokal); `npm run test:browser` (butuh esbuild, tailwindcss, playwright+Chromium; lihat `tests/browser/README.md`).

## 9. Cara menguji username dan metadata, dua akun
Lihat README §6.7 (langkah 1–7). Ringkas: ganti username saat terbit → URL baru hidup/lama 404/isi sama; akun B tidak bisa mengambil nama A, nama yang baru dilepas A, atau nama reserved; SEO baru tampil di `<head>` hanya setelah Publish; konflik dua tab menjaga isian.

## 10. Hasil tes SEBENARNYA (dijalankan)
| Jenis | Hasil |
|---|---|
| Tes unit `node --test tests/*.test.ts` | **199 lulus, 0 gagal** (baru: SEO, metadata, akun, `resolveSiteUrl`, kontrak action, callback, tab) |
| Type-check **dengan stub** `.d.ts` (bukan paket asli) | 0 galat |
| SQL di **Postgres 16 lokal + shim** (`scripts/test-db.sh`) | **347 PASS, 0 gagal.** Phase 7: validasi/reserved/unik, anon ditolak, username saat terbit (URL lama 404, URL baru melayani, tanpa snapshot baru, bukan "perubahan"), karantina (+kedaluwarsa), SEO (simpan, validasi, konflik, tidak menghapus katalog/tampilan/link, tidak bocor sebelum Publish, masuk snapshot setelah Publish, unpublish menjaga draft), profil parsial + revisi, tab editor usang ditolak, isolasi dua akun; migration 3–8 dijalankan ulang berurutan lalu tes 3–7 diulang (idempoten) |
| **Balapan username**, 2 sesi psql paralel × 25 nama | PASS: tepat satu pemenang per nama, tanpa duplikat, satu-satunya galat = `username_taken` |
| Regresi Phase 1–6 (RLS, claim, editor, publish, katalog, simpan draft, 3 sesi publish paralel, 2 sesi draft-vs-katalog) | PASS (asersi "username terkunci" Phase 3/4/6 sengaja diganti) |
| **Chromium nyata** (Playwright) atas komponen asli, **server action = stub** | **40 pemeriksaan lulus** (publik 18, editor 10, auth 4, **pengaturan 8**): 5 tab × 320/390/768/1280 tanpa overflow, input ≥16 px, target ≥40 px, semua berlabel; keyboard tab; debounce cek username (≤3 panggilan); dialog konfirmasi saat terbit; galat per field tanpa kehilangan input; SEO konflik menjaga input; email "menunggu konfirmasi" (email aktif tetap); kata sandi tidak muncul di log; status/unpublish; isian dipertahankan antar tab |

**Tidak dijalankan:** `npm install`, `next build`, `eslint` asli, type-check dengan paket asli; Supabase asli (Auth/email/Storage/RPC); ISR/`revalidatePath`/`generateMetadata` di Next asli; Safari iOS/Android; pembaca layar; animasi Motion; kinerja.

## 11. Batasan lingkungan
npm tidak terjangkau (tidak ada lockfile — sengaja tidak dipalsukan); tidak ada akses Supabase; Chromium memuat harness, bukan `next dev`. SQL diuji di Postgres dengan shim `auth`/`storage`, **bukan bukti perilaku Supabase asli** (mis. `auth.uid()`, `storage.objects`).

## 12. Risiko tersisa
1. Ganti email/kata sandi/atur ulang belum pernah dijalankan terhadap Supabase Auth asli (`updateUser`, `resetPasswordForEmail`, tipe OTP `email_change`/`recovery` di callback).
2. `revalidatePath` pada URL username lama/baru, dan metadata baru setelah Publish, belum diverifikasi di Next asli. Bila invalidasi gagal, ISR (`revalidate=3600`) bisa menyajikan versi lama hingga 1 jam.
3. Karantina 30 hari memengaruhi pemilik lama yang ganti-ganti nama: boleh kembali ke namanya sendiri kapan saja; tidak ada pembersihan otomatis baris `username_released` (tabel kecil; baris kedaluwarsa tidak berefek).
4. Username berlaku langsung tanpa Publish — keputusan desain; tautan lama yang sudah dibagikan menjadi 404 (tanpa redirect).
5. Pengaturan katalog/baris-per-baris editor masih last-write-wins (risiko Phase 6, tidak berubah).
6. Cek ketersediaan username (`is_username_available`) tersedia bagi pengguna masuk mana pun — bisa dipakai menebak nama; dibatasi hanya untuk yang login, belum ada pembatasan laju khusus.
7. Cadangan origin dari header `origin` pada `registerAction` (Phase 1) tidak diubah — tidak memengaruhi canonical, tetapi tetap bergantung pada Redirect URLs Supabase.

## 13. Langkah menuju Phase 8
Jalankan `npm install` + `build` + `lint` nyata dan perbaiki hasilnya; terapkan migration 1–8 ke proyek uji dan jalankan README §6.3, §6.6, §6.7 terhadap Supabase asli (termasuk email); uji `revalidatePath`/metadata di Vercel preview; uji perangkat nyata; baru kemudian fitur Phase 8.
