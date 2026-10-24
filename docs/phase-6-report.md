# Laporan Phase 6 — Premium UI, Motion & Responsive Polish

**Status keseluruhan: PARTIAL.** Seluruh perubahan kode selesai dan lolos pemeriksaan yang bisa dijalankan di lingkungan ini (tes unit, tes SQL di Postgres lokal, 32 pemeriksaan di Chromium nyata). `npm install`, `next build`, `eslint` asli, dan Supabase asli **tidak bisa dijalankan** (npm tidak terjangkau; Supabase 403), sehingga tidak dilaporkan berhasil.

## 1. Ringkasan

| Area | Hasil |
|---|---|
| Konflik `saveDraftAction` (risiko Phase 5) | **Diperbaiki + diuji** (RPC atomik `save_draft`, revisi per grup, merge jsonb parsial) |
| Design tokens | Diperluas dan dirapikan (`src/styles/tokens.css`); `globals.css` memakai token |
| Komponen bersama | Baru: `ConfirmDialog`, `Tabs`, `Toast`, `EmptyState`, `MotionProvider`. Konfirmasi hapus lama diganti |
| Responsif | Diperbaiki dan diuji di Chromium: 320/375/390/768/1024/1280/1920 px |
| Motion | Terukur (opacity/transform), seluruhnya dijaga `prefers-reduced-motion` |
| Aksesibilitas | Tab keyboard, dialog native, fokus, target sentuh, kontras token — diuji sebagian (lihat §8) |
| Halaman publik | Polish tipografi, avatar, kartu tautan, safe area, animasi muncul (hanya mode live) |
| Snapshot/publish Phase 4 | **Tidak diubah** |

## 2. Perbaikan konflik penyimpanan draft (§9 permintaan)

**Akar masalah (Phase 5).** `saveDraftAction` membaca `pages.draft_config` lalu menulis *seluruh* objek kembali. Bila konfigurasi katalog (`draft_config.catalog`) berubah di antara baca dan tulis, perubahan itu hilang diam-diam. Dua tab juga bisa saling menimpa profil/tampilan, dan simpan gagal separuh jalan ("profil tersimpan, tampilan belum").

**Solusi** (`supabase/migrations/20261019000000_phase6_draft_save.sql`, aditif + idempoten):
1. Kolom `pages.settings_rev` dan `profiles.profile_rev` (integer, mulai 0). Client **tidak** punya grant untuk menulisnya; hanya RPC.
2. RPC `save_draft(p_profile, p_settings, p_profile_rev, p_settings_rev)` — `SECURITY DEFINER`, `search_path=''`, identitas dari `auth.uid()`:
   - satu transaksi; mengunci baris `profiles` lalu `pages` (urutan tetap);
   - **hanya grup yang dikirim yang ditulis**; tiap grup diperiksa revisinya (optimistic concurrency) → `draft_conflict_profile` / `draft_conflict_settings` bila usang, tanpa menulis apa pun;
   - tampilan ditulis dengan **merge jsonb parsial** (`draft_config || {version, settings}`); kunci lain (mis. `catalog`) tidak pernah dibaca ulang oleh aplikasi;
   - ganti username memakai `change_username()` di transaksi yang sama (galat = seluruh simpan dibatalkan);
   - tidak menyentuh `published_snapshots`.
3. Klien (`src/lib/editor/draft-save.ts`): `planDraftSave()` mengirim hanya grup yang berubah beserta revisi yang diketahui. Reducer: gagal/konflik **tidak mengubah input**; ketikan baru saat proses simpan **tidak ditimpa** nilai lama; konflik menampilkan pesan jelas + tombol *Muat ulang versi terbaru*.
4. `saveDraftAction` tidak lagi menyentuh tabel/`draft_config` langsung (dijaga tes kontrak).

**Mengapa tidak konflik palsu:** tab yang hanya mengubah tampilan tidak mengirim profil, sehingga revisi profil yang usang tidak menghalanginya (dan sebaliknya). Perubahan katalog tidak menaikkan `settings_rev`.

### Tes lima skenario wajib
| # | Skenario | Bukti |
|---|---|---|
| 1 | Perubahan profil tidak menghapus perubahan katalog | `supabase/tests/phase6_draft_save.sql` [1], [1b] |
| 2 | Perubahan katalog tidak menghapus profil/tampilan | idem [2] + tes paralel 2 sesi (40× simpan tampilan vs 40× ubah katalog: revisi akhir 40, judul katalog terakhir utuh) |
| 3 | Update bersamaan tidak diam-diam menimpa | idem [3] (revisi usang ditolak, data terbaru utuh) |
| 4 | Kegagalan simpan mempertahankan input | SQL [4] (atomik) + `tests/draft-save.test.ts` (reducer) + browser editor (konflik: input utuh, tanpa toast sukses palsu) |
| 5 | Published snapshot utuh saat simpan draft gagal | SQL [5] (snapshot identik; tidak ada snapshot baru; simpan berhasil pun tidak mengubah live; publish ulang memuat draft terbaru = v2) |

> Semua berjalan di Postgres 16 lokal + shim Supabase. **Bukan** bukti pada Supabase asli.

## 3. Design tokens (`src/styles/tokens.css`)
Ditambahkan (nilai tunggal): warna status (`--rona-danger/-fg`, `--rona-success/-fg`), skala tipografi (`--rona-text-*`), skala jarak (`--rona-space-*`), elevasi (`--rona-elev-1..3`), permukaan (`--rona-surface-solid`, `--rona-field-bg`, `--rona-scrim`), fokus dua lapis (`--rona-focus`, `--rona-focus-halo`), target sentuh (`--rona-tap: 2.75rem`), safe area (`--rona-safe-*` dari `env(safe-area-inset-*)`), z-index (`--rona-z-*`), easing tambahan. Warna status literal di `globals.css` diganti token (dijaga tes). Palet merek (Porcelain/Soft ink/Mist/Sand/Champagne) tidak berubah; ikon asli RONA dipakai apa adanya.

Kontras (dihitung dengan `contrastRatio` proyek, dijaga `tests/design-tokens.test.ts`): teks/porcelain 14,7:1; teks sekunder/porcelain 6,1:1; danger/putih 7,3:1; success/putih 6,5:1; teks galat/notice 9,3:1; teks sukses/notice 8,5:1; toast sukses 14,7:1; toast galat 9,6:1; tombol bahaya 7,3:1 (semua ≥ 4,5:1).

## 4. Komponen yang diperbarui/ditambah
- **Baru:** `ui/confirm-dialog.tsx` (`<dialog>` native, `role="alertdialog"`, fokus awal pada *Batal*, Esc/klik latar membatalkan, fokus kembali ke pemicu), `ui/tabs.tsx` + `lib/ui/tabs.ts` (panah/Home/End, roving tabindex, `aria-controls`), `ui/toast.tsx` (sukses hilang 4 dtk; galat tidak hilang otomatis; timer dibersihkan), `ui/empty-state.tsx`, `motion/motion-provider.tsx` (`MotionConfig reducedMotion="user"`, hanya di dashboard).
- **Diubah:** `editor-shell` (Tabs, transisi panel opacity/transform, toast, grup `aria-pressed` Edit/Pratinjau, simpan per-grup, tombol muat ulang saat konflik, grid `minmax(0,1fr)`), `link-card` & `catalog-item-card` (konfirmasi hapus → `ConfirmDialog`), `links-panel` & `catalog-panel` (`EmptyState`), `page-view` (halaman publik), dashboard/auth layout (safe area, nav tidak meluap), `layout.tsx` (`viewportFit: "cover"`).
- **CSS:** fokus dua lapis; hover hanya pada perangkat hover (`@media (hover: hover)`); `touch-action: manipulation`; tablist satu baris yang bisa digeser (bukan membungkus); dialog katalog desktop kini dua kolom setinggi dialog (foto mengisi kolom kiri).

## 5. Motion
Hanya `opacity` dan `transform`; tidak ada animasi `width/height/top/left/margin/padding` (dijaga tes). Kemunculan konten halaman publik (`.rona-rise`) sekali saat dimuat, jeda bertingkat dibatasi 8 item, **hanya mode live** (pratinjau tidak beranimasi saat mengetik). Semua animasi CSS berada di bawah `prefers-reduced-motion: no-preference`; token durasi menjadi 0 pada `reduce`. Halaman publik tidak memuat Motion (tetap ringan). Slideshow: tidak berjalan otomatis pada reduced-motion; timer dan listener bersih saat modal ditutup (terverifikasi di Chromium).

## 6. Responsif
Bug nyata yang ditemukan dan diperbaiki lewat pengujian browser:
1. **Editor melebar melewati layar di ponsel** (grid satu kolom tanpa `minmax(0,1fr)` + tablist `nowrap`). Pada emulasi ponsel, viewport layout ikut melebar (404 px, bukan 320 px). Tes overflow versi pertama saya **lolos keliru** karena membandingkan dengan `innerWidth` yang ikut melebar; tes diperbaiki (bandingkan dengan lebar yang dimaksud) dan CSS diperbaiki.
2. `ConfirmDialog` awalnya tidak mengembalikan fokus ke pemicu (dialog dilepas sebelum `close()`); diperbaiki dan diuji.
3. Tab di ponsel membungkus jadi dua baris di dalam kapsul → satu baris yang dapat digeser.
4. Dialog katalog desktop menyisakan ruang kosong → foto mengisi tinggi dialog.

## 7. Pengukuran (ukuran aset — bukan kinerja runtime)
Dibandingkan memakai ZIP Phase 5 vs kode sekarang, dikompilasi dengan Tailwind 4.3.3 asli (kelas dipindai dengan regex dari `src/`, jadi mendekati — bukan identik dengan — output Next):

| | Phase 5 | Phase 6 |
|---|---|---|
| CSS (mentah) | 35.120 B | 43.106 B |
| CSS (gzip) | 6.861 B | 7.977 B (+1,1 KB) |
| JS klien halaman publik, harness (gzip) | 68.061 B | 68.247 B (+0,2 KB) |

JS harness mencakup React DOM karena dibundel utuh; di Next, halaman publik dirender server dan hanya komponen klien yang di-hydrate, jadi angka itu **bukan** ukuran produksi. **Tidak diukur:** LCP/INP/CLS, waktu render, egress Supabase, kinerja di HP nyata. Tidak ada klaim peningkatan performa; CSS justru bertambah sedikit.

## 8. Hasil tes yang benar-benar dijalankan
| Pemeriksaan | Hasil | Catatan |
|---|---|---|
| `node --test tests/*.test.ts` | **176 lulus, 0 gagal** | nyata (Node 22) |
| `bash scripts/test-db.sh` (Postgres 16 lokal + shim) | **280 baris PASS, 0 gagal**, 9 blok SELESAI, `exit 0` | **shim**, bukan Supabase asli; termasuk idempotensi migration 3–6 (+7), publish bersamaan 3 sesi, simpan-draft-vs-katalog 2 sesi |
| Pemeriksaan Chromium (`npm run test:browser`) | **32 lulus**: halaman publik+katalog+dialog 18, editor 10, auth 4 grup (12 kombinasi lebar) | komponen **asli** + CSS Tailwind **asli**; **stub**: server action, `next/link`, `next/image`, `motion/react` |
| Type-check | 0 galat | **berbasis stub** `.d.ts` (bukan `tsc` dengan paket asli) |
| Render SSR (react-dom/server) | OK (3 skrip) | harness di luar paket |
| Pemindai secret | bersih | |

Isi pemeriksaan Chromium: tanpa overflow horizontal (320–1920), jumlah kolom grid, hanya thumbnail dimuat untuk grid, modal (fokus di dalam, scroll latar terkunci, Esc, fokus kembali, timer/listener bersih), slideshow ±2 dtk dan menjeda saat interaksi, panah keyboard, reduced-motion (tanpa slideshow otomatis/animasi muncul), CTA WhatsApp ter-encode dan `javascript:` tidak pernah menjadi tautan, pratinjau tidak aktif, `ConfirmDialog` dan `Tabs` lewat keyboard, toast, editor: dua kolom proporsional di ≥1024 px, satu kolom + pemilih Edit/Pratinjau di bawahnya, target sentuh ≥ 40 px (≥ 44 px di dialog dan auth), pratinjau lokal tanpa request jaringan saat mengetik, simpan hanya mengirim grup yang berubah + revisi, konflik mempertahankan input, auth: input ≥ 16 px (tanpa zoom iOS), semua input berlabel, galat `role="alert"`.

### Belum bisa dijalankan / tidak diuji
- `npm install`, lockfile, `npm run build`, `npm run lint` dengan paket asli.
- Supabase asli (Auth, Storage, RPC `save_draft`, RLS) dan Next asli (ISR, `revalidatePath`, server action sungguhan).
- Animasi Motion (transisi panel tab) di browser — `motion/react` di-stub.
- Safari iOS, Android nyata, keyboard virtual, safe area pada perangkat nyata (hanya emulasi viewport Chromium).
- Header/nav dashboard (`dashboard/layout.tsx`, server component), halaman ringkasan dashboard, halaman onboarding (hanya formnya), `loading.tsx` — **tidak dirender di browser**.
- Pembaca layar sungguhan (NVDA/VoiceOver), audit kontras otomatis pada halaman utuh, kinerja runtime.

## 9. File
**Baru:** `supabase/migrations/20261019000000_phase6_draft_save.sql`; `supabase/tests/phase6_draft_save.sql`, `phase6_parallel_setup.sql`, `phase6_parallel_check.sql`; `src/lib/editor/draft-save.ts`; `src/lib/ui/tabs.ts`; `src/components/ui/{confirm-dialog,tabs,toast,empty-state}.tsx`; `src/components/motion/motion-provider.tsx`; `tests/{draft-save,ui-tabs,design-tokens}.test.ts`; `tests/browser/**` (harness + README); `scripts/browser-check.sh`; `docs/phase-6-report.md`.
**Diubah:** `src/styles/tokens.css`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/dashboard/layout.tsx`, `src/app/(auth)/layout.tsx`, `src/app/dashboard/editor/actions.ts`, `src/components/editor/{editor-shell,link-card,links-panel,catalog-item-card,catalog-panel}.tsx`, `src/components/page/page-view.tsx`, `src/lib/editor/{state,load,errors,action-types}.ts`, `scripts/test-db.sh`, `package.json` (0.6.0, `test:browser`), `tsconfig.json` / `eslint.config.mjs` (mengecualikan `tests/browser`), `.gitignore`, `README.md`.

## 10. Migration baru dan urutan
Migration ke-7: `20261019000000_phase6_draft_save.sql` (setelah 1–6). Aditif dan idempoten; tidak mengubah migration lama; tidak menghapus data. **Terapkan migration 7 sebelum men-deploy kode Phase 6**: editor kini membaca `profile_rev`/`settings_rev`, dan `saveDraftAction` memanggil `save_draft`. Tanpa migration, editor gagal dimuat. Tidak ada bucket/policy Storage baru. Migration **tidak** dijalankan otomatis ke proyek Supabase mana pun.

## 11. Risiko tersisa
1. **Pengaturan section katalog** (`set_catalog_settings`: aktif/judul) atomik tetapi tetap *last-write-wins* antar-tab (tanpa revisi). Hanya dua field; tidak menimpa profil/tampilan.
2. **Edit per-baris** (tautan, item katalog) tetap last-write-wins per baris (tanpa revisi).
3. Konflik hanya terdeteksi saat menyimpan; tidak ada penggabungan otomatis — pengguna memuat ulang lalu menerapkan ulang perubahannya.
4. Pengukuran kinerja belum dilakukan; CSS +1,1 KB gzip.
5. Tablist di ponsel dapat digeser; tab terakhir terpotong di tepi sebagai petunjuk (belum ada gradasi pemudar).
6. Risiko Phase 5 yang belum berubah: `bodySizeLimit` belum diverifikasi, aset yatim menumpuk, nomor WhatsApp berawalan 0 dianggap Indonesia, harga hanya rupiah bulat.
7. Panel Penerbitan di atas editor cukup tinggi di desktop (dapat dipadatkan pada iterasi berikutnya).

## 12. Insiden proses (jujur)
Saat menyusun harness, saya tanpa sengaja menjalankan `rm -f /dev/null` di sandbox kerja (salah ketik pada skrip), yang membuat `scripts/test-db.sh` gagal sementara. Perangkat dipulihkan (`mknod`, karakter 1,3, mode 666) dan seluruh tes dijalankan ulang. Tidak berdampak pada proyek, data, atau ZIP.

## 13. Langkah menuju Phase 7
1. Terapkan migration 1–7 ke proyek Supabase **uji**; jalankan README §6.6 (uji konflik dua tab) dan §6.4/§6.5.
2. Di mesin Anda: `npm install` (buat `package-lock.json`), `npm run check`, `npm run build`, `npm run test:db` (Postgres lokal) dan `npm run test:browser`.
3. Uji di iPhone/Android sungguhan: safe area, keyboard virtual, modal, slideshow.
4. Pertimbangkan revisi untuk pengaturan section katalog dan edit per-baris, serta pengukuran Lighthouse/egress sebelum klaim performa.
