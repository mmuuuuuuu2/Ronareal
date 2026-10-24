# Laporan Phase 5 — Services & Catalog System

**Status keseluruhan: PARTIAL.** Kode, migration, dan tes lokal selesai. Build, lint dengan konfigurasi asli, pengujian di browser, Supabase asli, dan deploy **belum** dijalankan.

## 1. Fitur
### Selesai (kode ada; diuji sebatas bagian 6)
- **Editor** (tab Katalog): aktif/nonaktifkan section; judul section kustom (bawaan "Layanan", maks 40); tambah/edit/hapus item (konfirmasi hapus); item tampil/tidak (draft); urutan item; simpan sebagai draft; preview draft langsung; terbit lewat panel Penerbitan Phase 4.
- **Field item**: judul, deskripsi singkat (≤160), deskripsi lengkap (≤2000), harga opsional (Rupiah bulat) + label harga, CTA (jenis, tujuan, label, template pesan WhatsApp), status tampil, urutan. Unicode/emoji/Bahasa Indonesia didukung; panjang dihitung per code point.
- **Foto**: maks 7/item (ditegakkan di UI, server action, trigger database, dan posisi 0..6); sampul otomatis = foto pertama, dapat diganti; urutan foto; hapus foto (konfirmasi); pratinjau sebelum unggah; kompres/resize di browser (foto ≤1600 px + thumbnail persegi 640 px, WebP/JPEG); server memeriksa magic bytes, ukuran, kepemilikan (SVG/HTML ditolak); mengedit teks tidak mengunggah ulang apa pun.
- **CTA**: WhatsApp (nomor dinormalkan ke `wa.me/<digit>?text=<ter-encode>`; awalan 0 dibaca +62), URL **https saja**, email, telepon; tujuan kosong = tanpa tombol; label/template yang diketik tidak ditimpa (kosong disimpan `NULL`, default hanya saat render); `javascript:`, `data:`, `vbscript:`, `http:` dll. ditolak di client, server, database, dan saat render.
- **Halaman publik**: section di `/{username}` dari snapshot saja; grid kartu 1:1 responsif (container query: 2/3/4 kolom); thumbnail lazy; tinggi kartu tidak dipaksa sama; modal detail hampir layar penuh (`<dialog>` native): galeri, judul, deskripsi, harga, CTA, tombol Tutup, ‹ ›, panah keyboard, thumbnail, Jeda/Putar; slideshow ±2 dtk, berhenti saat dikendalikan manual / ditutup / dilepas / tab tersembunyi, tidak otomatis bila `prefers-reduced-motion`; hanya foto aktif (+ prapemuatan 1 foto berikutnya) yang dimuat saat detail dibuka; section tidak muncul bila nonaktif/kosong; halaman tanpa katalog tetap sama seperti Phase 4.
- **Publish tunggal**: katalog ikut `publish_page_with_assets()`/`publish_page()` yang sama (satu transaksi, satu snapshot, satu invalidasi cache). Section nonaktif ⇒ katalog tidak masuk snapshot dan fotonya tidak disalin.

### Belum / sengaja tidak dikerjakan
- Pilihan layout katalog (spesifikasi: opsional; grid responsif tunggal dipilih agar scope tidak membesar).
- Pembersihan aset publik yatim, rollback snapshot, analytics, `/[username]/services`, domain kustom (Phase 6+).
- Seluruh pengujian pada Supabase/Next/browser asli (bagian 5).

## 2. File
**Baru:** `supabase/migrations/20261016050000_phase5_catalog.sql`, `supabase/tests/phase5_catalog.sql`, `src/lib/catalog/{cta,item,images,gallery,view,state}.ts`, `src/app/dashboard/editor/catalog-actions.ts`, `src/components/editor/{catalog-panel,catalog-item-card,catalog-photos}.tsx`, `src/components/page/{catalog-section.tsx,card-style.ts}`, `tests/catalog-{cta,item,view,gallery,assets,state,contract}.test.ts`, `docs/phase-5-report.md`.
**Diubah:** `src/components/page/page-view.tsx` (gaya kartu dipindah ke `card-style.ts`; render katalog; footer dipisah), `src/components/editor/editor-shell.tsx`, `src/components/publish/publish-panel.tsx` (pesan), `src/lib/editor/{load,errors,action-types,view-data}.ts`, `src/lib/publish/{assets,snapshot}.ts`, `src/app/dashboard/editor/publish-actions.ts`, `src/app/globals.css`, `supabase/tests/rls_isolation.sql` (penyesuaian: foto kini harus berpath milik pemilik + objek ada), `scripts/test-db.sh`, `tests/editor-errors.test.ts`, `README.md`, `package.json` (0.5.0).

## 3. Migration dan urutan
`foundation → phase1 → phase2 → phase3 → phase4 → phase5` (`20261016000000` … `20261016050000`). Migration lama **tidak diubah**. Phase 5: aditif + idempoten (diuji ulang). **Belum diterapkan ke Supabase Anda**; baca lalu jalankan manual (README §5).

## 4. Perubahan skema snapshot
`catalog` di snapshot kini berisi per item: `id, title, summary, description, price_amount, price_label, cta_type, cta_label, cta_value, cta_message, cover, images:[{path, thumb, w, h}]`. `config.catalog = {enabled, title}` (kunci `settings` tidak tersentuh). Bentuk dibangun oleh SATU fungsi (`build_catalog_payload`) untuk draft dan snapshot sehingga deteksi "ada perubahan belum diterbitkan" konsisten. Snapshot Phase 4 (tanpa kunci baru / `catalog: []`) tetap valid dan dirender tanpa section. Tabel: kolom baru `summary, price_amount, price_label, cover_image_id` (items) dan `thumb_path, thumb_published_path, width, height, size_bytes, mime` (images). **Bucket/policy: tidak ada perubahan** — pola `<uid>/catalog/<nama>.<ext>` dan kedua bucket sudah tersedia sejak migration 2; path publik = path draft (nama acak, immutable) sehingga salinan lama tidak pernah ditimpa. Aset publik **tidak pernah dihapus** (snapshot lama mungkin memakainya).

## 5. Perintah
```
npm install            # belum pernah dijalankan di lingkungan pembuat paket
npm run typecheck      # tsc --noEmit   (belum dijalankan dengan paket asli)
npm run lint           # eslint .       (belum dijalankan)
npm test               # node --test tests/*.test.ts
npm run test:db        # butuh Postgres 16 lokal; memakai shim, BUKAN Supabase asli
npm run build          # belum dijalankan
```

## 6. Hasil pengujian (apa yang benar-benar dijalankan)
| Pemeriksaan | Hasil | Jenis / batasan |
|---|---|---|
| `node --test tests/*.test.ts` | **159 lulus, 0 gagal** (termasuk 51+ tes katalog: validasi item/harga/Unicode, CTA & encoding WhatsApp, URL berbahaya, foto & batas 7, sampul/urutan, state editor, snapshot→tampilan, rencana aset, galeri & slideshow dengan timer palsu, kontrak statis otorisasi/cache/migration) | unit lokal; kontrak statis membaca source, bukan menjalankan Next |
| `bash scripts/test-db.sh` | **0 gagal, 242 baris PASS**; migration 4, 5, 6 dijalankan ulang (idempoten); 3 sesi publish paralel | Postgres 16 lokal + **shim** Supabase. Mencakup: tambah/edit/hapus item, batas 30 item/7 foto, path foto milik akun lain/SVG/traversal/objek tak ada ditolak, CTA berbahaya ditolak, client tak dapat menulis posisi/sampul/published_path, sampul otomatis & urutan, isolasi A/B (baca/ubah/hapus/urut/sampul/isi item lintas akun), publish pertama, draft ≠ live (edit/sembunyi/hapus foto), publish gagal mempertahankan snapshot lama, republish, section nonaktif, unpublish, cascade hapus item |
| tsc strict dengan stub `.d.ts` | **0 galat** | bukan type-check paket asli (React/Next/Supabase di-stub) |
| `scripts/check-secrets.mjs` | bersih | lokal |
| Render SSR (react-dom/server): grid memakai thumbnail saja, foto penuh tidak dimuat sebelum detail dibuka, teks pengguna di-escape, `javascript:` tidak menjadi href, section hilang bila nonaktif/kosong/tanpa katalog, dialog (aria, kontrol, CTA live vs preview) | **OK** | harness sementara di luar paket; **tidak** menjalankan efek/klik, jadi slideshow/focus/Esc di DOM nyata **belum teruji** — hanya logikanya (reducer + pengendali timer) |
| `npm install`, `npm run build`, `npm run lint`, browser, Supabase asli, Storage asli, ISR/`revalidatePath`, deploy | **TIDAK dijalankan** | tidak ada jaringan ke npm/Supabase; tidak diklaim |

## 7. Langkah uji manual di browser dan dua akun
Lihat README §6.4 (editor) dan §6.5 (halaman publik, galeri, modal, reduced-motion, isolasi dua akun, pemeriksaan tab Network untuk thumbnail vs foto penuh).

## 8. Risiko dan keterbatasan yang diketahui
- Perilaku nyata `<dialog>`/container query/slideshow di Safari iOS & Android, serta ISR/`revalidatePath` pada versi Next terpasang, belum terverifikasi.
- Semantik baris `storage.objects` (pemeriksaan "objek ada" di DB) diasumsikan dari shim; verifikasi di Supabase asli.
- `experimental.serverActions.bodySizeLimit: 6mb` belum diverifikasi; Server Action tidak memberi progres unggah (indikator "n/total").
- Dimensi gambar dikirim client (hanya metadata tampilan, dibatasi 1..16384); server tidak mendekode gambar. Isi file diperiksa magic bytes saja (bukan dekode penuh/anti-polyglot).
- Pengoptimalan egress **tidak diukur**: keputusan desain saja (thumbnail 640 px untuk grid, foto penuh hanya di modal, cache 1 tahun untuk objek publik immutable, satu RPC publik). Tidak ada klaim penghematan.
- Aset publik/draft yatim menumpuk (hapus foto/item hanya membersihkan draft); `saveDraftAction` (Phase 3) menulis ulang `draft_config` dari bacaan sebelumnya — dalam jendela milidetik ia dapat menimpa perubahan `catalog` dari `set_catalog_settings` yang bersamaan.
- Nomor WhatsApp berawalan 0 diasumsikan Indonesia; nomor internasional harus diawali + atau 00. Harga hanya Rupiah bulat.
- Indikator "perubahan belum diterbitkan" di editor optimistis; status akurat dari RPC.
- Editor memuat tanda tangan URL semua foto draft dalam satu panggilan (≤ ~420 path) saat dibuka.
- Pengujian visual/aksesibilitas (kontras, screen reader) belum dilakukan.

## 9. Langkah menuju Phase 6
1. Verifikasi nyata: `npm install` (+ lockfile), `typecheck`, `lint`, `build`, terapkan migration 6 di proyek uji, jalankan §6.4–6.5 di browser dan dengan dua akun, deploy ke Vercel.
2. Halaman katalog `/{username}/services` (opsional), SEO/Open Graph per item, deep link ke item tanpa merusak URL utama.
3. Retensi/pembersihan aset publik yatim dan rollback ke snapshot lama.
4. Analytics ringan (klik CTA), pilihan layout katalog, domain kustom.
