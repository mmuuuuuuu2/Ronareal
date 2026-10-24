# Laporan Phase 8 — Integrasi, Regresi, Keamanan & Kesiapan Produksi

**Status akhir: PARTIAL.** Perbaikan kode dan tes yang bisa dijalankan di lingkungan ini sudah dilakukan (satu bug keandalan kritis ditemukan dan diperbaiki, hak akses diperketat, logging aman ditambahkan, tes integrasi lintas fase dibuat). Tetapi kriteria penting **belum terverifikasi**: build/lint/type-check dengan dependency asli, Supabase asli, Next asli (ISR, `revalidatePath`, `generateMetadata`), Vercel, dan perangkat nyata. RONA **belum** boleh disebut siap produksi.

## 1. Keadaan lingkungan (fakta yang dicatat)
- `npm view next version` dan `curl https://registry.npmjs.org/next` → `Could not resolve host` / `ENOTFOUND`. Registry npm tidak terjangkau; saya tidak mengubah proxy dan tidak mengulang dengan jalan memutar. Akibatnya: **tidak ada `npm install`, `package-lock.json`, `next build`, `eslint` asli, atau type-check dengan paket asli** (tidak ada lockfile palsu; versi dependency tidak diubah).
- Tersedia: Node 22.22, Postgres 16 lokal, Chromium+Playwright, esbuild, Tailwind 4.3.3, TypeScript (tsc) tanpa paket proyek.

## 2. Ringkasan integrasi Phase 0–7 (diperiksa dari kode sampai database)
Auth/onboarding (`claim_profile` atomik) → dashboard → editor (draft, revisi `profile_rev`/`settings_rev`/`seo_rev`) → link & katalog (RLS per pemilik) → upload ke bucket `draft-assets` privat → publish (`publish_page_with_assets`, snapshot atomik, salin aset ke `public-assets`) → halaman publik (`get_public_page`, satu RPC, ISR) → pengaturan (Phase 7: username, SEO, status). Kontrak RPC aplikasi↔database kini dijaga tes otomatis (§6).

## 3. Masalah ditemukan, urut prioritas

| # | Prioritas | Masalah | Status |
|---|---|---|---|
| 1 | Keandalan/publish | **Deadlock**: `publish_page_with_assets()` mengunci `pages` lalu menulis `profiles` (avatar); `save_draft()` (Phase 6) mengunci `profiles` lalu `pages`. Simpan draft bersamaan dengan Terbitkan dapat saling menunggu (`40P01`). **Direproduksi** dengan 2 sesi paralel (60×publish + 60×save_draft; beberapa galat deadlock 40P01 teramati) sebelum perbaikan | **Diperbaiki** (migration 9: `save_draft` mengunci `pages` dulu); tes paralel lulus tanpa galat |
| 2 | Keamanan | `anon`/`authenticated` memegang `TRUNCATE`, `REFERENCES`, `TRIGGER` pada semua tabel publik (TRUNCATE tidak tunduk RLS) | **Diperbaiki** (dicabut) |
| 3 | Keamanan/data | Client dapat `INSERT`/`DELETE` langsung pada `pages` dan `profiles`: pemilik bisa menghapus halamannya lewat API (merusak akun) atau menyisipkan baris `pages` dengan `is_published`/`published_snapshot_id` sembarang | **Diperbaiki** (dicabut; baris dibuat hanya oleh `claim_profile()`) |
| 4 | Privasi | `is_username_available()` bisa dipanggil `anon` → siapa pun bisa menebak username akun yang belum terbit | **Diperbaiki** (dicabut dari anon). Pengguna masuk masih bisa memeriksa (diperlukan onboarding/ganti username) |
| 5 | Observabilitas | Tidak ada logging server sama sekali; `error.tsx` mencatat objek galat mentah di console | **Diperbaiki**: `src/lib/log.ts` (samaran JWT/Bearer/kunci/token/email; hanya nama, kode, status, pesan ≤200 karakter) dipakai di semua `fail()` action; `error.tsx` hanya mencatat digest |
| 6 | Konfigurasi | Tidak ada HSTS | **Ditambah** (`Strict-Transport-Security`, tanpa `preload`) |
| 7 | UX | Rute `/dashboard/settings` belum punya state loading | **Ditambah** (`loading.tsx`) |
| 8 | Kualitas tes | Tes Phase 0–2 mengandalkan `INSERT` langsung dan `anon` memanggil `is_username_available`; sengaja **diubah** agar sesuai hak akses baru (migration lama tidak diubah). Asersi baru memastikan penolakan | Dilakukan |

## 4. Masalah yang masih terbuka
1. **Build/lint/type-check asli belum pernah dijalankan** pada proyek ini (Phase 0–8). Kemungkinan ada galat tipe/lint/build yang hanya muncul dengan paket asli (mis. opsi `experimental.serverActions.bodySizeLimit`, nama `middleware` vs `proxy` di Next 16, tipe `@supabase/ssr`).
2. Perilaku ISR + `revalidatePath` (URL lama/baru, setelah publish/unpublish/ganti username) dan `generateMetadata` **belum terbukti** di Next asli. Bila gagal, halaman bisa basi hingga 1 jam (`revalidate = 3600`).
3. Semua RPC/Auth/Storage hanya diuji di Postgres + shim; perilaku `auth.uid()`, `storage.objects`, RLS di Supabase asli belum dibuktikan.
4. Email Auth (konfirmasi, ganti email, reset kata sandi) belum diuji.
5. Policy Storage `public-assets` mengizinkan pemilik meng-upload/menghapus objek di folder sendiri langsung dengan JWT-nya (server action memakai sesi pengguna yang sama; tanpa service-role tidak bisa dipersempit). Dibatasi bucket (MIME + ukuran) dan regex path `<uid>/(avatar|background|link|catalog)/…`; isi file tidak diverifikasi untuk unggahan langsung (hanya untuk jalur aplikasi). Risiko: pemilik menghapus aset live miliknya sendiri → gambar rusak di halaman publiknya; tidak memengaruhi pengguna lain.
6. Tidak ada CSP (ditunda; perlu nonce dan uji dengan Next asli).
7. Tidak ada timeout eksplisit/ retry pada panggilan Supabase di server (tidak ada retry otomatis untuk operasi non-idempoten — disengaja).
8. Pembatasan laju (rate limit) hanya dari Supabase Auth bawaan; `is_username_available` bagi pengguna masuk belum dibatasi.
9. Halaman ringkasan dashboard, header, dan alur registrasi→verifikasi email→onboarding belum diuji di browser dengan aplikasi asli.
10. Pengukuran kinerja (bundle JS, LCP/INP, jumlah request produksi, egress) **belum dilakukan**.

## 5. Migration lengkap dan urutan
| # | File | Isi singkat |
|---|---|---|
| 1 | `20261016000000_foundation.sql` | tabel inti, RLS, reserved usernames, bucket |
| 2 | `20261016010000_phase1_onboarding_assets.sql` | `is_username_available`, `claim_username`, policy storage |
| 3 | `20261016020000_phase2_claim_profile_reserved.sql` | `claim_profile`, reserved tambahan |
| 4 | `20261016030000_phase3_editor.sql` | guard path/link, `reorder_links`, `change_username` |
| 5 | `20261016040000_phase4_publish.sql` | publish/snapshot/`get_public_page`/`get_publish_state` |
| 6 | `20261016050000_phase5_catalog.sql` | katalog + payload snapshot |
| 7 | `20261019000000_phase6_draft_save.sql` | `save_draft`, revisi |
| 8 | `20261021000000_phase7_account_page_settings.sql` | username saat terbit, karantina, SEO, profil parsial |
| 9 | **`20261023000000_phase8_hardening.sql`** | urutan kunci `save_draft`; cabut hak berlebih; anon tak bisa menebak username |

Pemeriksaan otomatis (`tests/integration-contract.test.ts`): timestamp unik & berurutan, nama sesuai pola, tidak ada `drop table/column`, `truncate`, atau `delete` data; migration 8–9 idempoten (`if not exists`/`create or replace`, tanpa `drop`); semua fungsi `SECURITY DEFINER` mengunci `search_path`; setiap `rpc("…")` di source ada di migration dengan nama parameter sama. Idempotensi dijalankan nyata: migration 3–9 diulang berurutan di Postgres lokal lalu tes 3–8 diulang.
Catatan: migration 3–6 mendefinisikan ulang fungsi (`create or replace`); **mengulang migration lama setelah yang baru akan mengembalikan definisi lama** — selalu jalankan berurutan dan jangan jalankan ulang file lama sendirian.

### Prosedur penerapan (jangan otomatis)
1. **Backup** proyek uji/produksi (Dashboard → Database → Backups, atau `pg_dump`).
2. **Periksa skema** (README §5 langkah 1) dan versi migration yang sudah ada: `select * from supabase_migrations.schema_migrations order by 1;` (jika memakai CLI).
3. Terapkan **di proyek uji dulu**, berurutan, hanya yang belum diterapkan.
4. **Verifikasi hasil**:
   ```sql
   -- RLS aktif di semua tabel publik
   select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r';
   -- tidak ada hak berlebih untuk anon/authenticated
   select grantee, table_name, privilege_type from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');   -- harus 0 baris
   select has_table_privilege('authenticated','public.pages','INSERT'), has_table_privilege('authenticated','public.pages','DELETE');  -- false,false
   select has_function_privilege('anon','public.is_username_available(text)','EXECUTE');  -- false
   select has_function_privilege('authenticated','public.save_draft(jsonb,jsonb,integer,integer)','EXECUTE');  -- true
   ```
5. Baru kemudian terapkan ke produksi dengan persetujuan Anda, lalu deploy kode.

## 6. Hasil tes PER KATEGORI (yang benar-benar dijalankan)
| Kategori | Alat | Hasil |
|---|---|---|
| Dependency asli / build / lint / type-check asli | — | **Tidak dijalankan** (registry tidak terjangkau) |
| Type-check **stub** | `tsc` + `stubs.d.ts` buatan sendiri | 0 galat — **bukan** bukti type-check asli |
| Unit + kontrak statis | `node --test tests/*.test.ts` | **210 lulus, 0 gagal** (+11 baru Phase 8: migration, RPC, kunci, hardening, logging, konfigurasi, error boundary) |
| SQL, Postgres 16 lokal + **shim** Supabase | `scripts/test-db.sh` | **383 PASS, 0 gagal**: isolasi RLS, claim, editor, publish, katalog, simpan draft, Phase 7, **Phase 8 integrasi (alur A–D + hardening)**; idempotensi migration 3–9 |
| SQL paralel (psql multi-sesi) | `scripts/test-db.sh` | draft vs katalog (2 sesi); 3 sesi publish; balapan username (25 nama); **publish vs simpan draft** (60+60, tanpa deadlock, direproduksi sebelum perbaikan) |
| Browser **harness** (Chromium nyata; server action, `next/link`, `next/image`, Motion = stub) | Playwright | **43 pemeriksaan lulus**: publik+katalog (modal, slideshow, reduced-motion, CTA), editor, auth, pengaturan; lebar 320/360/390/768/1024/1440/1920: tanpa overflow, input ≥16 px, target ≥40 px, berlabel, dialog/tab keyboard, Esc |
| Browser dengan aplikasi Next asli, E2E sebenarnya | — | **Tidak dijalankan** |
| Supabase asli | — | **Tidak dijalankan** |
| Pemindaian secret | `scripts/check-secrets.mjs --package` | bersih pada source dan pada hasil ekstraksi ZIP (mode `--package`) |

### Alur E2E yang dicakup di mana
- **A (registrasi→publik)**: SQL `phase8_integration.sql` A1–A4 (klaim atomik → profil/link/katalog/SEO → anon tidak melihat draft → terbit → anon melihat snapshot, tanpa path draft/token). Verifikasi email dan UI-nya: **tidak diuji**.
- **B (draft vs publish)**: B1–B6 (live identik sebelum publish; **publish gagal** (aset belum ada) → tidak ada snapshot setengah jadi & live lama utuh; publish → versi baru). Publish gagal karena kegagalan **Storage nyata**: tidak dapat disimulasikan di sini (hanya via `assets_not_published`).
- **C (unpublish/republish)**: C1–C3 (anon 404, draft utuh, republish = snapshot terbaru).
- **D (isolasi)**: D1–D13 + H1–H8: B tidak bisa membaca/mengubah/menambah link-katalog A, tidak bisa memalsukan path avatar A, tidak bisa menerbitkan memakai aset A, tidak bisa `publish_page()`, username tak bisa ganda; metadata/halaman tidak tercampur; anon tidak membaca `pages`/`published_snapshots`. **Cache Next dua pengguna: tidak teruji** (hanya argumen: halaman publik tanpa `cookies()/headers()`, kunci cache = path `/<username>`, pengujian statis).

## 7. Temuan keamanan (ringkas)
Diperbaiki: #1–#4 di §3. Dipertahankan/diverifikasi: semua tabel RLS aktif; semua RPC `SECURITY DEFINER` memakai `search_path=''`; `publish_page()`, `build_*`, guard trigger tidak dapat dipanggil client; anon hanya `get_public_page`; `username_released`/`reserved_usernames` tanpa policy; kolom revisi & `*_published_path` tidak dapat ditulis client; URL link dan path aset divalidasi di server dan DB; tidak ada `service_role` di source (dites); tidak ada `NEXT_PUBLIC_*` rahasia (dites); galat tidak membocorkan pesan mentah (dites untuk logger dan pemetaan). Terbuka: §4 poin 5–8.

## 8. Konflik penyimpanan (Phase 6–7) — diperiksa ulang
Revisi per grup (`profile_rev`, `settings_rev`, `seo_rev`) tetap ditegakkan; tidak ada last-write-wins baru. Skenario: profil+katalog bersamaan (tes paralel Phase 6), dua tab beda revisi (Phase 6/7 SQL + browser), publish ×3 bersamaan (versi 1..20 tanpa celah), **publish vs simpan draft** (kini aman), ubah draft saat publish berjalan (publish mengunci `pages`; perubahan avatar di antara baca dan RPC → `assets_not_published`, gagal aman), simpan gagal → input tetap (browser harness).

## 9. Publish, snapshot, cache
Snapshot dibuat dalam satu transaksi dan hanya memuat path publik; unpublish menutup akses; republish memulihkan; username lama → 404 dan baru → snapshot (SQL). `revalidatePath` dipanggil untuk URL yang tepat (kontrak statis). **Efek cache di Next asli belum terbukti.**

## 10. Performa
Diukur: CSS hasil kompilasi Tailwind harness **43,3 KB / 8,1 KB gzip** (satu stylesheet). **Tidak diukur:** bundle JS produksi, LCP/INP, jumlah request, egress. Pemeriksaan kode/harness (bukan pengukuran): grid katalog hanya memuat thumbnail; pratinjau editor lokal tanpa request; cek username di-debounce (≤3 panggilan untuk satu ketikan); timer slideshow dibersihkan (browser harness); tidak ada polling.

## 11. File yang berubah (signifikan)
Baru: `supabase/migrations/20261023000000_phase8_hardening.sql`; `supabase/tests/phase8_{integration,lock_setup,lock_check}.sql`; `src/lib/log.ts`; `src/app/dashboard/settings/loading.tsx`; `tests/integration-contract.test.ts`.
Diubah: `next.config.ts` (HSTS); `src/app/error.tsx` (log hanya digest); `src/app/dashboard/{settings,editor}/*actions.ts` (logger); `.env.example` (penjelasan `NEXT_PUBLIC_SITE_URL`); `scripts/test-db.sh` (tes paralel baru, idempotensi 3–9, tes Phase 7/8); `supabase/tests/{rls_isolation,phase1_claim_and_assets,phase2_claim_profile}.sql` (menyesuaikan hak akses baru); `tests/browser/*` (7 lebar viewport); README.

## 12. Konfigurasi produksi / Vercel
Environment variables — **wajib**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (Production **dan** Preview). **Opsional/tidak dipakai**: `SUPABASE_SERVICE_ROLE_KEY` (tidak dipakai; jangan diisi). Redirect Auth: `<SITE_URL>/auth/callback` di Supabase. `.vercel.app` bekerja tanpa konfigurasi domain khusus (tidak ada domain terkunci di `next.config.ts`; dites). Konfigurasi Vercel **belum diuji** (tidak ada akses, tidak ada deploy).

## 13. Langkah verifikasi manual (setelah `npm install`)
1. `npm install` → commit `package-lock.json`; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — perbaiki galat pertama satu per satu dan kirim ke saya.
2. Terapkan migration 1–9 ke proyek **uji** (prosedur §5).
3. Jalankan README §6.3, §6.6, §6.7 terhadap proyek uji; di Vercel preview periksa URL lama/baru setelah ganti username (§4 poin 2) dan sumber halaman (`<title>`, `og:*`, canonical).
4. Uji email (registrasi, ganti email, reset) dan dua akun nyata.
5. Uji iPhone Safari & Android Chrome.

## 14. Checklist finalisasi produksi (belum selesai)
- [ ] `npm install` + lockfile; type-check, lint, unit, build asli lulus
- [ ] Migration 1–9 di proyek uji lalu produksi (setelah backup & persetujuan)
- [ ] Pengaturan Auth: Site URL, Redirect URLs, template email, SMTP sendiri
- [ ] `NEXT_PUBLIC_SITE_URL` + 2 env Supabase di Vercel (Production & Preview)
- [ ] Verifikasi ISR/`revalidatePath`/metadata di Vercel preview
- [ ] E2E dengan aplikasi asli (Playwright terhadap `next start` + Supabase uji)
- [ ] Uji perangkat nyata & pembaca layar; ukur LCP/INP/bundle
- [ ] Keputusan CSP, rate limit, retensi `username_released`
- [ ] Backup & rencana rollback (migration aditif; rollback = pulihkan backup)

**Risiko tersisa:** §4. Tidak ada klaim "production-ready".
