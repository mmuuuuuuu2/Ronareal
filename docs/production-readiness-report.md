# RONA — Laporan Kesiapan Produksi (finalisasi teknis setelah Phase 8)

**Status: PARTIAL. RONA BELUM dapat disebut production-ready.**
Alasan utama: dependency asli, `next build`, lint/type-check asli, Supabase asli, dan Vercel **belum pernah dijalankan** (blocker di §6).
Tanggal: 2026-10-23. Lingkungan pembuatan: Node **v22.22.0**, npm **10.9.4**, Linux 6.18 (kontainer cloud, akses jaringan lewat proxy egress berkebijakan).

## 1. Diagnosis akses npm (Prioritas 1)
| Uji | Hasil nyata |
|---|---|
| `npm ping` / koneksi langsung | `npm error code ENOTFOUND … getaddrinfo ENOTFOUND registry.npmjs.org` — DNS lokal tidak me-resolve. `registry.npmjs.org` ada di `NO_PROXY` sehingga npm dan curl tidak memakai proxy. |
| `curl` lewat proxy egress (hanya uji satu kali, `NO_PROXY` dikosongkan untuk perintah itu saja) | `CONNECT tunnel failed, response 403`. Log proxy: `connect_rejected … gateway answered 403 to CONNECT (policy denial or upstream failure) host registry.npmjs.org:443` |
| Kesimpulan | Dua lapis: (a) DNS langsung tidak ada, (b) lewat proxy host **ditolak kebijakan egress sesi ini**. Ini **bukan** salah paket/proxy yang bisa diperbaiki dari dalam project. Panduan proxy sesi melarang mengulang atau menghindari penolakan 403, jadi **tidak ada** konfigurasi jaringan, mirror, atau registry alternatif yang diubah/dicoba. |
| Dampak | `npm install`, `package-lock.json`, `npm run check` (bagian typecheck/lint asli), `npm run build` **tidak dapat dijalankan di sini**. Lockfile tidak dibuat manual. |

**Yang perlu dari Anda:** pindahkan project ke komputer/CI yang bisa mengakses registry npm (laptop Anda, GitHub Actions, atau sesi dengan egress npm), lalu jalankan `bash scripts/verify-with-npm.sh`.

### Skrip verifikasi (`scripts/verify-with-npm.sh`) — cara kerja
- **Node:** wajib ≥ 22.18 (cek numerik); versi Node, npm, OS, hash `package.json`/lockfile dicatat di `verification-output/summary.txt`. Node lebih lama → FAIL, kode keluar 3.
- **INTI** (butuh registry): `npm ping`, `npm install`/`npm ci`, pemeriksaan lockfile (`npm ci --dry-run`), `check:secrets`, tes unit, `lint`, `build`, `typecheck`. `check:secrets` dan tes unit tetap dijalankan walau registry mati (tidak butuh dependency). `typecheck` dijalankan **setelah** `build` karena `tsconfig.json` memuat `next-env.d.ts` dan `.next/types` yang dibuat `next build` (mencegah gagal palsu). Build tanpa `.env.local` memakai env **placeholder** (`https://placeholder-build-only.supabase.co`, `sb_publishable_PLACEHOLDER_BUILD_ONLY`) dan dicatat; build dengan env nyata dicatat "env nyata".
- **TAMBAHAN** (prasyarat di luar npm; tidak ada = **SKIPPED** dengan alasan, bukan lulus):
  - `test:db`: mencari PostgreSQL **16** (`$PGBIN`, `/usr/lib/postgresql/16/bin`, `/usr/pgsql-16/bin`, Homebrew `postgresql@16`, atau `initdb` di PATH; versi diverifikasi lewat `initdb --version`) dan menolak berjalan sebagai root tanpa `runuser`/user non-root.
  - `test:browser`: `scripts/preflight-browser.mjs` memeriksa esbuild, tailwindcss v4, playwright, **Chromium milik Playwright (file benar-benar ada)**, react, dan react-dom di lokasi yang benar. `RONA_TOOLS` yang diatur eksplisit adalah satu-satunya kandidat; selain itu folder proyek, lalu `/opt/npm-tools` hanya bila ada. `npm run test:browser` kini memakai pemeriksaan yang sama dan keluar kode 10 bila tidak lengkap.
- **Hasil:** tiap langkah PASS/FAIL/SKIPPED + exit code asli (`results.tsv`), awal galat ditampilkan di ringkasan, log penuh per langkah. Kode keluar: `0` semua PASS · `1` ada FAIL · `4` tanpa FAIL tetapi ada SKIPPED (tetap PARTIAL) · `2` registry tidak terjangkau (satu-satunya FAIL) · `3` Node terlalu lama.
- **Tidak mengubah apa pun:** tidak menyentuh `package.json`, tidak menulis lockfile (hanya npm yang membuat), tidak menerapkan migration, tidak deploy.

### Usulan (BELUM dilakukan; butuh persetujuan Anda): `esbuild` dan `playwright` sebagai devDependencies
Saat ini keduanya **tidak** ada di `package.json`; harness browser memakainya dari folder alat terpisah (`RONA_TOOLS`), sehingga `package.json`/lockfile tidak berubah. Alternatif: menambahkan `esbuild` dan `playwright` ke `devDependencies`. Dampak: lockfile bertambah; `npm install` (termasuk build Vercel, yang memasang devDependencies) mengunduh paket Playwright tambahan (set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` di Vercel agar Chromium tidak ikut terunduh); Chromium tetap harus diunduh manual (`npx playwright install chromium`, ratusan MB) di mesin yang menjalankan `test:browser`; tailwindcss v4 sudah ada di devDependencies. Keuntungan: `test:browser` berjalan tanpa folder alat terpisah. Saran saya: tetap di folder terpisah sampai build asli lulus.

## 2. Pengujian yang benar-benar berhasil (dijalankan ulang pada kode final ini)
| Kategori | Perintah | Hasil |
|---|---|---|
| Unit + kontrak statis (tanpa dependency asli) | `node --test tests/*.test.ts` | **216 lulus, 0 gagal** (termasuk kontrak: README tanpa ZIP lama, skrip verifikasi PASS/FAIL/SKIPPED, preflight tidak menulis apa pun, `schema_check.sql` hanya SELECT, workflow tanpa `continue-on-error`/secret, `.gitignore`/`.env.example`/`.gitattributes`) |
| Pemindai secret | `node scripts/check-secrets.mjs` | OK, tidak ada secret |
| SQL di **Postgres 16 lokal + shim Supabase** (BUKAN Supabase asli) | `bash scripts/test-db.sh` | **383 PASS, 0 FAIL**, exit 0. Migration 1–9 berurutan, rerun idempoten 3–9, alur A–D, 4 skenario paralel (draft vs katalog, 3 publish, balapan username, publish vs save_draft tanpa deadlock) |
| Pemeriksa skema `supabase/verify/schema_check.sql` pada hasil migration 1–9 (Postgres lokal + shim) | dijalankan manual | **74 baris, semua `true`**. Uji negatif: setelah `GRANT TRUNCATE`/`INSERT` sengaja diberikan, 2 baris menjadi `false` (pemeriksa terbukti bisa mendeteksi) |
| Browser **harness** (Chromium nyata, komponen asli; server action, `next/link`, `next/image`, Motion = **stub**) | `scripts/browser-check.sh` | **43 pemeriksaan lulus**, 7 lebar 320–1920 px |
| Type-check **dengan stub** `.d.ts` | `tsc -p` stub | 0 galat. **Bukan** bukti type-check asli |

| Logika `verify-with-npm.sh` itu sendiri | dijalankan di sesi ini (registry mati): hasil nyata `registry-ping` FAIL (ENOTFOUND) → `install/lockfile/lint/build/typecheck` SKIPPED, `check-secrets` PASS, `test-unit` PASS, `test-db` PASS, `test-browser` SKIPPED; kode keluar **2** (blokir lingkungan). Dijalankan juga di salinan scratch dengan **npm PALSU** (hanya untuk menguji akuntansi status, bukan bukti build): typecheck gagal → FAIL, kode 1; tanpa PG16/alat browser → 2 SKIPPED, kode 4, build memakai env placeholder; Node 20 (shim) → FAIL, kode 3; semua prasyarat ada → db 383 PASS dan browser 43 PASS lewat `npm run` | Membuktikan skrip tidak menandai SKIPPED sebagai lulus. Pada putaran ini skrip juga menangkap satu kegagalan nyata: tes kontrak lama masih mencari teks skrip lama (diperbaiki) |

Angka di atas **tidak** boleh dijumlahkan atau dibaca sebagai "build lulus".

## 3. Pengujian yang gagal
- **Tidak ada tes yang gagal pada kode final.** Satu-satunya kegagalan nyata di sesi ini adalah akses registry (§1): `ENOTFOUND registry.npmjs.org` dan `CONNECT 403`.
- Dua kegagalan tes saat menulis tes baru (regex `describe/it` tidak cocok gaya berkas; pemeriksa DML ikut mencocokkan teks di dalam literal string `'TRUNCATE'`) adalah kesalahan tes buatan saya sendiri, sudah diperbaiki, bukan cacat aplikasi.
- Temuan Phase 8 yang sudah diperbaiki (deadlock `40P01` Terbitkan vs Simpan draft, hak tabel berlebih, enumerasi username anon) tercatat di `docs/phase-8-report.md`.

## 4. Yang belum dapat dilakukan (dan alasannya)
| Item | Alasan |
|---|---|
| `npm install`, `package-lock.json` valid, kecocokan versi `package.json` (Next 16, React 19.2, Tailwind 4, `@supabase/ssr` 0.7, ESLint 9, TS 5.9) | Registry diblokir (§1) |
| `next build`, `eslint` asli, `tsc` asli, tes dengan Next asli | Bergantung pada instalasi |
| E2E/browser dengan aplikasi Next asli | Bergantung pada build |
| ISR (`revalidate = 3600`), `revalidatePath`, `generateMetadata`, middleware di Next asli | Tidak bisa dibuktikan tanpa Next asli |
| Supabase asli: Auth/email, Storage, RPC, RLS terhadap `auth.uid()` asli | Tidak ada proyek Supabase yang dapat diakses; prosedur ada di `docs/supabase-test-project-verification.md` |
| Vercel (env vars, `.vercel.app`, build log) | Tidak ada akses; tidak ada deploy yang dilakukan |
| Safari iOS/Android nyata, pembaca layar, pengukuran kinerja (LCP/TTFB) | Tidak ada perangkat/jaringan nyata; hanya ukuran CSS terukur (8,1 KB gzip) |

## 5. Audit migration 1–9 (Prioritas 3)
- Urutan dan nama: `…000000_foundation` → `…010000_phase1` → `…020000_phase2` → `…030000_phase3` → `…040000_phase4` → `…050000_phase5` → `20261019000000_phase6` → `20261021000000_phase7` → `20261023000000_phase8_hardening`. Tes kontrak memeriksa urutan, tanpa `DROP TABLE`/`TRUNCATE`/`DELETE` destruktif, `search_path` pada SECURITY DEFINER, dan idempotensi.
- Diterapkan berurutan pada Postgres 16 bersih tanpa galat; rerun 3–9 berurutan tanpa galat dan tes ulang lulus. `schema_check.sql` mencocokkan hasilnya dengan skema yang ditargetkan: 8 tabel ber-RLS, 19 RPC, semua SECURITY DEFINER ber-`search_path` kosong, `publish_page` tak dapat dipanggil client, `is_username_available` tak dapat dipanggil anon, tanpa `TRUNCATE/REFERENCES/TRIGGER`, tanpa `INSERT/DELETE` langsung pada `pages`/`profiles`, bucket `draft-assets` privat dan `public-assets` publik (5 MB; jpeg/png/webp), policy Storage lengkap.
- **Batas klaim:** ini terhadap Postgres + shim. Perilaku Supabase asli (mis. peran, ekstensi, `storage.foldername`, `auth.uid()`) hanya terbukti setelah §C di `docs/supabase-test-project-verification.md`.
- Migration **tidak** diterapkan ke Supabase mana pun. Migration lama tidak diubah.

## 6. Risiko keamanan terbuka dan mitigasi
**Storage — `public-assets` (risiko sedang).** Pemilik akun boleh meng-upload/mengubah/menghapus objek langsung di folder `<uid>/…` bucket publik (policy insert/update/delete). Dampak: hanya ke aset miliknya (tidak lintas akun; path dibatasi regex; MIME/5 MB dibatasi bucket). Namun pemilik dapat memakai bucket publik sebagai hosting gambar bebas dalam batas itu dan menaruh objek yang tak pernah lewat alur Terbitkan. Mitigasi bertahap: (1) pantau pemakaian Storage di Dashboard dan pasang alert kuota; (2) bila perlu, hapus policy tulis `public_assets_*` dan salin aset saat Terbitkan lewat route server berkunci service-role (kunci hanya di env server Vercel, tidak pernah di client/repo) — butuh keputusan dan desain tambahan karena menambah rahasia server; (3) tidak ada kuota per pengguna: tambahkan bila akan dibuka untuk publik luas.

**CSP (belum ada; risiko rendah–sedang).** Sengaja tidak ditambahkan agar tidak memblokir Next (script inline hidrasi), gambar Supabase, dan font. Langkah aman: (1) deploy `Content-Security-Policy-Report-Only` dulu dengan `default-src 'self'`; `img-src 'self' data: blob: https://<ref>.supabase.co`; `connect-src 'self' https://<ref>.supabase.co`; `style-src 'self' 'unsafe-inline'`; `script-src` sesuai build; (2) kumpulkan pelanggaran di Preview selama beberapa hari lintas halaman; (3) baru ubah ke enforcing. Catatan: CSP ber-nonce memaksa render dinamis dan dapat meniadakan ISR di `/[username]`; pertimbangkan hash/`strict-dynamic` atau pertahankan Report-Only. Header lain yang sudah ada: HSTS dan header keamanan dasar di `next.config.ts` (belum terbukti di Vercel asli).

**Rate limit (risiko sedang).** (1) Auth: bergantung batas bawaan Supabase Auth (cek di Dashboard → Auth → Rate Limits); SMTP bawaan Supabase sangat dibatasi — pakai SMTP sendiri untuk produksi. (2) `is_username_available` bisa dipanggil berulang oleh akun yang login → enumerasi nama: mitigasi = debounce 500 ms di UI pengaturan username, Vercel Firewall/WAF rate-limit pada route aksi, atau tabel hitung per `auth.uid()` di RPC (butuh migration baru dan persetujuan). (3) Upload/publish/save tidak punya batas laju sendiri; batas ukuran dan jumlah (50 link, 30 item, 7 foto) menahan sebagian. (4) Tidak ada timeout eksplisit pada panggilan Supabase dari server action.

**Lainnya:** katalog baris tunggal (edit item) masih last-write-wins (draft dan pengaturan sudah ber-revisi); tanpa pelacak galat pihak ketiga (logging aman ke stdout Vercel saja); email diverifikasi manual di Dashboard.

## 7. Langkah yang memerlukan akses atau persetujuan Anda (urutan sama dengan README)
1. Ekstrak ZIP → GitHub Desktop → *Add local repository* (folder `rona`) → Publish (privat).
2. Tab **Actions**: tunggu CI dan *Generate lockfile*; baca **Summary**. Semua ✅ = langkah 3 boleh dilanjutkan; ❌ = kirim galat pertama.
3. Proyek Supabase **uji**: terapkan migration 1–9 berurutan (atas persetujuan Anda), jalankan `schema_check.sql`, atur Auth URL (`docs/supabase-test-project-verification.md` §A).
4. Vercel: impor repo, isi 3 variabel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) untuk Production dan Preview, Deploy. Jangan memakai/membagikan service-role key.
5. Tambahkan URL Vercel ke Supabase Redirect URLs; Redeploy bila `NEXT_PUBLIC_SITE_URL` berubah.
6. Jalankan `docs/post-deployment-checklist.md`; tempel hasil di §11.
7. Backup sebelum migration di proyek yang berisi data; deploy produksi hanya atas persetujuan Anda.

## 8. Checklist sebelum label "production-ready" boleh dipakai
- [ ] GitHub Actions **CI** hijau di repo Anda (Summary: install, secret scan, unit, lint, build, typecheck, db, browser semua ✅; versi Node/npm tercatat)
- [ ] `package-lock.json` asli ter-commit (oleh workflow *Generate lockfile* atau manual); `npm ci` bersih di run CI berikutnya
- [ ] `schema_check.sql` semua `true` di Supabase uji; tabel tes manual 18 baris + `docs/post-deployment-checklist.md` lulus
- [ ] Alur A–D lulus di aplikasi asli + Supabase asli; ISR/revalidasi terbukti
- [ ] Env Vercel Production/Preview terisi; `.vercel.app` berfungsi
- [ ] Keputusan tertulis untuk Storage, CSP, rate limit
- [ ] Uji perangkat nyata (Safari iOS, Android) dan ukur kinerja

## 9. Berkas yang ditambah/diubah pada tahap ini
Baru (putaran ini): `.github/workflows/ci.yml`, `.github/workflows/lockfile.yml`, `.gitattributes`, `.nvmrc`, `docs/post-deployment-checklist.md`, `docs/migrations.md`, `docs/manual-tests.md` (dipindah dari README); README ditulis ulang; `docs/supabase-test-project-verification.md` diperluas (Auth URL, Storage, RLS, env). Sebelumnya: `scripts/verify-with-npm.sh` (ditulis ulang pada putaran kedua: PASS/FAIL/SKIPPED), `scripts/preflight-browser.mjs`, `supabase/verify/schema_check.sql`, `docs/supabase-test-project-verification.md`, `docs/production-readiness-report.md`. Diubah: `README.md` (instruksi ekstrak ZIP, commit message, status, langkah pertama), `package.json` (versi 0.6.0 → 0.8.0 saja; **dependensi tidak diubah**), `.gitignore` (`verification-output/`), `tests/integration-contract.test.ts` (+4 tes), `scripts/browser-check.sh` (preflight; kode 10 bila prasyarat kurang), `tests/browser/README.md`. Tidak ada perubahan source aplikasi atau migration.

## 10. Kesiapan GitHub, CI, dan Vercel (tahap ini)
**Dibuat (belum pernah dijalankan di runner GitHub — tidak ada akses dari sini):**
- `.github/workflows/ci.yml`: runner `ubuntu-24.04`, Node 22, PostgreSQL 16, alat browser di folder terpisah dengan versi dipatok (esbuild 0.28.2, tailwindcss 4.3.3, playwright 1.56.0 — versi yang dipakai harness saat dikembangkan; bila registry tidak memilikinya CI akan FAIL jelas), lalu `scripts/verify-with-npm.sh`. Job gagal pada FAIL **atau** SKIPPED. Summary tabel + artifact log (dipindai pola secret) 30 hari. Izin `contents: read`; tidak memakai secret.
- `.github/workflows/lockfile.yml`: bila `package-lock.json` belum ada, `npm install --package-lock-only` (npm asli), bukti `npm ci --dry-run`, commit ke branch, lalu memicu CI (`workflow_dispatch`, karena push oleh `GITHUB_TOKEN` tidak memicu workflow lain). Izin `contents: write` dan `actions: write` hanya untuk workflow ini. Branch dilindungi → push gagal dengan pesan jelas + artifact cadangan. Aksi pihak ketiga dipatok ke tag mayor (`@v4`), bukan SHA (SHA tidak dapat diverifikasi offline); pertimbangkan pematokan SHA.
- `.gitignore` (melindungi `.env*` kecuali `.env.example`, `node_modules`, `.next`, `.vercel`, build/log), `.gitattributes` (LF, agar skrip `.sh` tidak rusak oleh CRLF Windows), `.nvmrc` (22), README alur 7 langkah, `docs/post-deployment-checklist.md`.
- Logika yang **diuji lokal** (bukan di GitHub): blok Ringkasan dan Pindai-secret dijalankan terhadap log nyata (pemindai menangkap JWT uji dan bersih pada log asli); langkah commit/push lockfile disimulasikan dengan repo bare lokal (sukses, push ditolak → exit 1, lockfile sudah ada → tidak melakukan apa pun); YAML valid.
- **Vercel:** tidak ada `vercel.json` (tidak diperlukan: Next.js terdeteksi otomatis, build `next build`). Header keamanan dan `no-store` rute privat di `next.config.ts`. `middleware.ts` dipertahankan (Next 16: deprecated, tetap berfungsi dengan peringatan). Tidak ada deployment dan tidak ada perubahan akun Vercel.
- **Belum diverifikasi:** seluruh perilaku di runner GitHub dan Vercel; `experimental.serverActions.bodySizeLimit` pada Next 16 (komentar di `next.config.ts` mencatat lokasinya belum diverifikasi — bila build menolaknya, CI akan menunjukkannya); `eslint`/`tsc` asli bisa menemukan galat baru.

**Temuan fungsional (tidak ditambah fiturnya sesuai instruksi):** tidak ada alur "lupa kata sandi" untuk pengguna yang belum masuk; reset kata sandi hanya tersedia di Pengaturan setelah masuk. Callback sudah menerima `type=recovery`, jadi menambahkannya kelak kecil. Putuskan apakah wajib sebelum rilis publik.
**Catatan lingkungan:** berkas `.env.local` milik Anda ada di folder kerja pembuat; **tidak** dimasukkan ke ZIP (diperiksa di hasil ekstraksi).

## 11. Hasil verifikasi Anda (isi setelah menjalankan)
| Tanggal | Lingkungan (Node/npm/OS) | Langkah | Hasil | Catatan |
|---|---|---|---|---|
| | | | | |
