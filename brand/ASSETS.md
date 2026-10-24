# Aturan aset brand RONA

## Sumber tunggal
- **Satu-satunya file asli:** `brand/rona-icon-source.png` (1254×1254, PNG RGB tanpa alpha).
- SHA-256: lihat `brand/rona-icon-source.png.sha256`. Jika hash berubah, berarti aset diganti — itu keputusan brand, bukan perubahan kode.
- Jangan edit file sumber. Jangan salin ke lokasi lain secara manual.

## Turunan (dihasilkan, bukan ditulis tangan)
`bash scripts/generate-icons.sh` membuat, hanya dengan resize proporsional (Lanczos, tanpa crop/distorsi/ubah warna):

| File | Kegunaan |
|---|---|
| `public/icons/rona-16/32/48.png`, `src/app/favicon.ico` | favicon, tab browser |
| `public/icons/apple-touch-icon.png` (180) | iOS home screen |
| `public/icons/rona-192.png`, `rona-512.png` | manifest PWA (purpose `any`) |
| `public/icons/rona-180.png` | sama dengan apple-touch-icon (sumber turunan) |

Semua turunan boleh dihapus dan dibuat ulang kapan saja. Komponen UI memakai satu komponen `<RonaMark />` (Phase 1) yang merujuk ke satu berkas turunan; tidak ada komponen lain yang meng-hardcode path icon.

## Di mana dipakai / tidak dipakai
Dipakai: favicon, metadata & manifest, login/registrasi, landing, navigasi dashboard, loading/empty state, pengaturan brand, dokumentasi.
**Tidak** dipakai: kartu link, tombol, atau konten milik pengguna. Di halaman publik pengguna, branding RONA hanya berupa footer kecil ("dibuat dengan RONA"), identitas pemilik halaman tetap fokus.

## SVG
Tidak ada versi SVG. Konversi PNG→SVG yang setia membutuhkan tracing vektor dari gradien yang kompleks dan belum diverifikasi; sampai ada sumber vektor dari desainer, gunakan PNG asli. Jangan menamai PNG dengan ekstensi `.svg`.

## Catatan temuan pada file sumber
- Sudut luar squircle berwarna hitam solid (bukan transparan). Ini apa adanya pada file asli dan tidak dimodifikasi. Efeknya: di tab browser/iOS yang berlatar terang, sudut terlihat hitam. Jika ingin sudut transparan, minta file sumber dengan alpha dari desainer — jangan diakali dengan crop.
- Tidak ada varian maskable khusus (zona aman). Manifest memakai purpose `any` saja.

## Penggunaan di aplikasi (Phase 2)
- Komponen tunggal `src/components/rona-mark.tsx` memakai `public/icons/rona-192.png`; favicon dari `src/app/favicon.ico`; metadata ikon di `src/app/layout.tsx`.
- Karena sudut luar file asli berwarna hitam solid, ikon ditampilkan dengan `border-radius: 23%` lewat CSS (`.rona-mark`). Ini hanya pemotongan saat tampil; file asli dan turunannya tidak diubah. Untuk hasil terbaik di latar terang, minta versi dengan sudut transparan dari desainer.
