# Laporan Phase 4 — Public Page & Publish System

**Status keseluruhan: PARTIAL.** Kode, migration, dan tes lokal selesai. Build, lint dengan konfigurasi asli, Supabase asli, dan deploy **belum** dijalankan.

## 1. Fitur selesai (kode ada, diuji sebatas disebut di bagian 3)
- Halaman publik `/[username]`: tanpa login, hanya bila terbit; 404 identik untuk username tak ada/belum terbit; hanya membaca snapshot (tidak pernah draft); memakai `PageView` mode live; metadata; URL tautan aman; tautan nonaktif tidak dirender.
- Publish/unpublish lewat Server Action tanpa id/path dari client; kepemilikan divalidasi dari sesi server; transaksi atomik; versi live lama tetap bila gagal.
- Status: Draft, Diterbitkan, Ada perubahan belum diterbitkan, Menerbitkan, Berhasil diterbitkan, Gagal menerbitkan. Sukses ditampilkan hanya setelah transaksi berhasil.
- Aset: hanya gambar yang dipakai disalin dari `draft-assets` (privat) ke `public-assets`; path diturunkan dari DB, bukan dari client; pemilikan divalidasi; tidak ada penghapusan aset publik.
- Konkurensi: `select … for update` pada baris halaman + advisory lock.
- Cache: ISR (`revalidate = 3600`) + `revalidatePath` saat publish/unpublish; satu RPC anon tanpa cookie; editor/dashboard/preview dinamis dan tidak di-cache publik.
- UX: URL publik, Buka, Salin (dengan fallback tanpa Clipboard API), konfirmasi unpublish, galat jelas, draft utuh saat gagal.

## 2. Migration baru
`supabase/migrations/20261016040000_phase4_publish.sql` (ke-5). Idempoten, aditif, migration lama tidak diubah. **Belum diterapkan ke Supabase Anda**; jalankan manual setelah membaca isinya. Menutup celah: client tidak dapat lagi memanggil `publish_page()` langsung atau menulis kolom `*_published_path`.

## 3. Hasil tes (semua lokal)
| Tes | Hasil | Jenis |
|---|---|---|
| `node --test tests/*.test.ts` | 102 lulus, 0 gagal | unit lokal |
| `bash scripts/test-db.sh` | 145 PASS, 0 gagal; migration 4 & 5 diuji ulang (idempoten); 3 sesi paralel | Postgres 16 lokal + shim Supabase (**bukan Supabase asli**) |
| tsc dengan stub `.d.ts` | 0 galat | bukan type-check paket asli |
| `scripts/check-secrets.mjs` | bersih | lokal |
| Render react-dom/server (halaman publik, `javascript:` tidak jadi href, CopyUrl) | OK | harness sementara di luar paket |

Cakupan SQL: publish pertama, edit tidak mengubah live, re-publish, gagal melindungi live, penggantian gambar, isolasi A/B, pembatasan anon, pemalsuan tulis client diblokir, riwayat snapshot, keunikan/kunci username.

## 4. Status build
`npm install`, lockfile, `npm run build`, `npm run lint`: **tidak dijalankan** (npm tidak terjangkau). Tidak ada lockfile palsu.

## 5. Supabase asli
**Tidak diuji**: Auth, RPC, Storage salin draft→public, URL bucket publik. Semantik baris `storage.objects` diasumsikan dari shim.

## 6. Deploy
**Belum**. Tidak ada klaim production-ready.

## 7. Masalah/risiko yang diketahui
- Perilaku ISR/`revalidatePath` pada versi Next terpasang belum diverifikasi; 404 ter-cache hilang via `revalidatePath` atau 3600 dtk.
- `experimental.serverActions.bodySizeLimit` belum diverifikasi.
- Aset publik tak pernah dihapus (yatim menumpuk); pembersihan ditunda karena riwayat snapshot.
- Indikator "perubahan belum diterbitkan" di editor bersifat optimistis; status akurat dari RPC.
- Publish butuh ≥1 tautan terlihat; username terkunci saat terbit.
- Dashboard memanggil satu RPC status per load.
- Server Action tidak memberi progres unggah.
- Belum ada uji browser.

## 8. Langkah Phase 5
Katalog `/[username]/services`; retensi/pembersihan aset publik; rollback ke snapshot lama; analitik; domain kustom; verifikasi nyata (install, build, lint, Supabase asli, Vercel).
