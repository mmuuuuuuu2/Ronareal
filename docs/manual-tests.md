# Uji manual aplikasi (lokal atau setelah deploy)

Dipindahkan dari README. Checklist pasca-deploy yang ringkas: `docs/post-deployment-checklist.md`.

## Menjalankan lokal
```bash
npm run dev
```
Buka `http://localhost:3000`. Uji manual (belum pernah dijalankan; ini verifikasi pertama):
1. Buka `/dashboard` tanpa masuk → harus diarahkan ke `/login`.
2. `/register` → daftar → buka tautan di email (atau langsung lanjut bila konfirmasi dimatikan).
3. `/onboarding` → isi nama tampilan dan username → status ketersediaan muncul → simpan.
4. `/dashboard` menampilkan profil; `Keluar` mengembalikan ke `/login`.
5. Daftar akun kedua; pastikan data akun pertama tidak terlihat.

### 1 Memakai editor halaman (Phase 3)
Dari dashboard klik **Buka editor halaman** (atau menu *Editor*). Layar kecil: tab **Edit / Pratinjau**; layar lebar: berdampingan. Tombol **Ponsel/Desktop** mengubah ukuran pratinjau.
- **Profil:** foto (pilih → atur zoom/geser → *Potong & unggah*, rasio 1:1), nama tampilan, username, bio. Username tidak bisa diganti bila halaman sudah diterbitkan (fitur terbit belum ada).
- **Tampilan:** warna/gambar latar (dipotong 9:16), warna teks & aksen, gaya komponen (kaca/solid/garis), sudut, jarak antar tautan, bentuk foto, perataan, tampilkan deskripsi. Ada peringatan kontras bila teks sulit dibaca.
- **Tautan:** *Tambah tautan* → judul, URL (https/http/mailto/tel; `javascript:` dan `data:` ditolak), deskripsi, ikon atau gambar → **Simpan tautan**. Atur urutan dengan **↑ Naik / ↓ Turun** (tersimpan otomatis ke database), **Tampilkan** untuk sembunyi/tampil, **Hapus** meminta konfirmasi.
- **Simpan draft** menyimpan profil + tampilan. Semuanya **draft**: tidak ada yang menjadi publik (penerbitan dikerjakan di fase berikutnya). Peramban memperingatkan bila Anda menutup halaman dengan perubahan yang belum disimpan.

### 2 Menguji draft dan preview (uji manual pertama Anda)
1. Ketik nama/bio/warna → pratinjau berubah **seketika** tanpa permintaan jaringan (cek tab *Network*: tidak ada request saat mengetik).
2. Tambah 3 tautan, simpan, **muat ulang halaman** → semua kembali sama (draft tersimpan di database).
3. Ubah urutan, muat ulang → urutan bertahan.
4. Coba URL `javascript:alert(1)` → ditolak dengan pesan jelas.
5. Matikan internet lalu simpan → muncul galat, isian **tidak hilang**; nyalakan lagi, klik *Coba simpan lagi*.
6. Unggah gambar > 5 MB, file SVG, dan file `.txt` yang diganti nama `.png` → semuanya ditolak.
7. Dengan akun kedua, pastikan tidak ada data akun pertama (juga di Supabase *Table Editor* dengan akun anon).
8. Aktifkan "Reduce motion" di OS → tidak ada animasi berlebih.

### 3 Menerbitkan dan membatalkan penerbitan (Phase 4)
Panel **Penerbitan** ada di atas editor (dan ringkasannya di dashboard). Status: *Draft — belum diterbitkan*, *Menerbitkan…*, *Berhasil diterbitkan*, *Diterbitkan*, *Ada perubahan belum diterbitkan*, *Gagal menerbitkan*.
1. Siapkan minimal 1 tautan yang ditampilkan dan nama tampilan, lalu klik **Terbitkan halaman**. Draft profil/tampilan yang belum tersimpan disimpan otomatis dulu; tautan yang belum disimpan harus disimpan manual.
2. Server memvalidasi, menyalin hanya gambar yang dipakai dari bucket privat `draft-assets` ke `public-assets`, lalu membuat snapshot dalam satu transaksi. URL publik, **Buka halaman publik**, dan **Salin URL** muncul HANYA setelah berhasil.
3. Buka `http://localhost:3000/<username>` di jendela/browser **tanpa login** → halaman tampil. Link nonaktif tidak muncul; URL berbahaya tidak pernah menjadi tautan.
4. Edit draft (mis. ubah judul tautan) → halaman publik **tidak berubah**; status menjadi *Ada perubahan belum diterbitkan*. Klik **Terbitkan perubahan** → halaman publik berubah.
5. **Batalkan penerbitan** (ada konfirmasi) → `/<username>` menjadi 404; draft tetap utuh. Terbitkan lagi bila perlu.
6. Uji gagal: matikan internet lalu terbitkan → muncul galat, draft utuh, versi live lama tetap tampil.
7. Dua akun: akun B tidak dapat membaca/menerbitkan/membatalkan halaman akun A; `/<username-A>` tetap hanya menampilkan snapshot A.
8. Username yang tidak ada, atau halaman yang belum terbit, memberi 404 yang sama.

### 4 Katalog di editor (Phase 5)
Tab **Katalog** di editor. Semua perubahan hanya masuk **draft**; halaman publik tidak berubah sampai Anda menerbitkan.
1. Atur section: centang/hapus centang *Tampilkan section katalog*, ubah judul (bawaan “Layanan”, maks 40 karakter), klik **Simpan pengaturan section**.
2. **+ Tambah item** → isi judul (wajib), deskripsi singkat (maks 160), deskripsi lengkap (maks 2000), harga (angka bulat) + label harga, lalu **Simpan item**. Emoji dan aksara Indonesia didukung.
3. Tombol (CTA): pilih WhatsApp / URL https / email / telepon. Kosongkan jenis untuk **tanpa tombol**. Untuk WhatsApp, isi template pesan (placeholder `{judul}` `{username}` `{nama}`) atau biarkan kosong untuk template bawaan. Label dan template yang Anda ketik tidak pernah ditimpa. URL `javascript:`, `data:`, `http://` ditolak.
4. Foto (setelah item tersimpan): **+ Tambah foto** (JPG/PNG/WebP, SVG ditolak, maks 7 per item). Foto dikompres di browser, tampil sebagai pratinjau, lalu **Unggah**. Foto pertama otomatis jadi sampul; ganti dengan **Jadikan sampul**; atur urutan dengan ← →; hapus dengan konfirmasi.
5. Urutan item: ↑ Naik / ↓ Turun. Kotak **Tampilkan di halaman** menyembunyikan item (draft) tanpa menghapusnya. **Hapus** meminta konfirmasi.
6. Pratinjau di kanan menampilkan katalog draft terbaru. Klik kartu untuk melihat detail; tombol CTA di pratinjau sengaja tidak aktif.
7. Klik **Terbitkan** (panel Penerbitan) — katalog diterbitkan bersama profil/tautan dalam SATU transaksi yang sama (tidak ada tombol publish kedua). Item belum tersimpan akan menghalangi publish sampai disimpan.

### 5 Menguji halaman publik katalog dan dua akun (uji manual di browser)
1. Buka `/<username>` tanpa login: section katalog muncul (grid 2 kolom di ponsel, 3–4 di layar lebar) hanya dengan item yang diterbitkan.
2. Klik kartu → modal hampir layar penuh: galeri, judul, deskripsi, harga, tombol CTA, tombol **Tutup**. Foto lebih dari satu: slideshow ±2 dtk, tombol ‹ ›, tombol Jeda/Putar, panah keyboard. Tutup modal (✕, Esc, klik di luar) → slideshow berhenti. Aktifkan *Reduce motion* di OS → slideshow tidak berjalan otomatis.
3. Tombol WhatsApp membuka `wa.me` dengan teks terisi; pesan tidak terkirim otomatis.
4. Ubah judul item di draft → halaman publik tidak berubah; terbitkan ulang → berubah. Sembunyikan/hapus item di draft → tetap tampil di publik sampai diterbitkan ulang.
5. Nonaktifkan section → terbitkan → section hilang. Hapus semua item aktif → section tidak muncul (tidak ada section kosong).
6. Foto draft privat: salin URL gambar draft (bertanda tangan) dari editor — setelah ±1 jam kedaluwarsa; URL tanpa tanda tangan ke `draft-assets` harus 400/404. Foto publik hanya ada di `public-assets` setelah terbit.
7. Dua akun: akun B tidak dapat melihat/mengubah item/foto akun A (editor B tidak menampilkannya), dan halaman publik B tidak memuat item A.
8. Periksa tab Network: grid hanya memuat thumbnail (`…-t.webp`); foto penuh hanya dimuat saat modal dibuka (satu per satu).

### 6 Menguji simpan draft anti-konflik dan UI baru (Phase 6)
1. **Dua tab:** buka `/dashboard/editor` di dua tab. Tab 1: ubah *Nama tampilan* → **Simpan draft** (muncul toast "Draft tersimpan"). Tab 2 (belum dimuat ulang): ubah *Bio* → **Simpan draft** → harus muncul pesan "Draft ini sudah diubah dari tab atau perangkat lain…" **dan isian Bio Anda tetap ada**. Klik *Muat ulang versi terbaru*; nama dari tab 1 harus ada.
2. **Tidak ada konflik palsu:** Tab 1: ubah hanya *Tampilan* (mis. radius) → simpan. Tab 2 (belum dimuat ulang): ubah hanya *Nama tampilan* → simpan → **berhasil** (grup data berbeda, tidak saling menimpa). Bila tab 2 mengubah *Tampilan* juga, simpan ditolak karena konflik.
3. **Katalog tidak tertimpa:** di tab 1 ubah judul section katalog → *Simpan pengaturan section*. Di tab 2 (usang) ubah warna di *Tampilan* → *Simpan draft*. Muat ulang: judul katalog dari tab 1 **tetap ada** (ini perbaikan risiko Phase 5).
4. **Halaman live tidak berubah** oleh simpan draft; hanya berubah setelah **Terbitkan**.
5. **UI:** hapus tautan/item → muncul dialog konfirmasi (fokus awal pada *Batal*, Esc membatalkan). Tab editor dapat dipindah dengan tombol panah/Home/End. Di ponsel: tab bisa digeser, pemilih *Edit/Pratinjau* tampil, tombol ≥ 44 px, tidak ada geser horizontal halaman. Aktifkan *Reduce motion* di OS: animasi muncul mati, slideshow tidak berjalan otomatis.
6. **Uji di perangkat nyata** (iPhone Safari dan Android Chrome): safe area (notch/home indicator), keyboard virtual tidak menutupi field/tombol, modal katalog pas di layar, geser tab.

### 7 Menguji pengaturan akun, username, dan SEO (Phase 7)
1. Buka `/dashboard/settings` (menu *Pengaturan*). Lima tab: Akun, Username & URL, Pengaturan halaman, SEO & berbagi sosial, Status halaman.
2. **Username saat terbit:** terbitkan halaman, ubah username di tab *Username & URL* → dialog konfirmasi → simpan. `/<username-baru>` menampilkan halaman; `/<username-lama>` menampilkan *tidak ditemukan* (tanpa pengalihan). Isi halaman tidak berubah; status tidak menjadi "ada perubahan belum terbit".
3. **Dua akun:** akun A dan B (dua browser/profil). B mencoba nama A → "sudah dipakai"; B mencoba nama yang baru dilepas A → "baru saja dilepas" (30 hari); B mencoba `dashboard`/`settings`/`api` → "dicadangkan sistem".
4. **SEO:** isi judul/deskripsi/gambar berbagi → simpan. Lihat sumber `/<username>` (View Source): **belum** berubah. Klik *Terbitkan perubahan* (tab Status) → muat ulang: `<title>`, `og:*`, `twitter:*`, dan `<link rel="canonical">` berubah dan memakai `NEXT_PUBLIC_SITE_URL`.
5. **Konflik dua tab:** buka pengaturan di dua tab; simpan SEO di tab 1; simpan SEO di tab 2 (usang) → pesan konflik, isian tab 2 tetap ada.
6. **Email/kata sandi:** ganti email → status *Menunggu konfirmasi*, email aktif tidak berubah sampai tautan dibuka. Kata sandi: ubah langsung, atau *Kirim tautan atur ulang ke email*.
7. **Batalkan penerbitan:** tab Status → konfirmasi → `/<username>` 404, draft utuh, tautan live hilang.

