# Checklist pengujian setelah deployment

Jalankan **setelah** CI hijau, migration 1–9 + `schema_check.sql` lulus di proyek Supabase uji, dan deploy Vercel berhasil. Gunakan dua akun (A dan B) dengan **dua browser/profil berbeda** (atau satu jendela privat). Beri tanda ✅/❌ dan catat catatan; salin hasilnya ke `docs/production-readiness-report.md` §11. Jangan meminta atau membagikan service-role key; semua uji lewat UI atau kunci anon.

URL aplikasi: `https://<nama>.vercel.app` (disebut `$URL`).

## 1. Akun dan autentikasi
| # | Langkah | Hasil yang diharapkan | ✅/❌ |
|---|---|---|---|
| 1.1 | Buka `$URL/dashboard` tanpa masuk | Dialihkan ke `/login` | |
| 1.2 | `/register` akun A (email nyata) | Email konfirmasi tiba; tautan membuka `$URL/auth/callback…` lalu `/onboarding` | |
| 1.3 | Buka tautan konfirmasi di **perangkat/browser lain** | Tetap berhasil (template `token_hash`) atau pesan jelas | |
| 1.4 | Keluar (logout) lalu masuk lagi | Sesi pulih; `/dashboard` terbuka | |
| 1.5 | Setelah logout, tekan Back | Tidak menampilkan data dashboard (no-store) | |
| 1.6 | Reset password: Pengaturan → Akun → kirim tautan atur ulang kata sandi (setelah masuk; tidak ada halaman "lupa kata sandi" di halaman login) | Email tiba; tautan membuka callback → ubah kata sandi → masuk dengan sandi baru | |
| 1.7 | Ganti email di Pengaturan | Status "menunggu konfirmasi" sampai dikonfirmasi sesuai pengaturan *Secure email change* | |

## 2. Onboarding dan username
| # | Langkah | Hasil | ✅/❌ |
|---|---|---|---|
| 2.1 | Isi nama tampilan + username unik | Status ketersediaan muncul; tersimpan; masuk dashboard | |
| 2.2 | Username terlarang (mis. `admin`, `api`) | Ditolak | |
| 2.3 | Akun B memakai username A | Ditolak (tidak tersedia) | |
| 2.4 | A mengubah username (Pengaturan → Username) saat halaman **terbit** | Berlaku segera; URL lama → 404; username lama terkarantina 30 hari bagi akun lain | |

## 3. Draft dan preview
| # | Langkah | Hasil | ✅/❌ |
|---|---|---|---|
| 3.1 | Ubah nama/bio/tema → Simpan draft | Tersimpan; preview mengikuti | |
| 3.2 | Buka editor di 2 tab, simpan di tab 1 lalu tab 2 (usang) | Tab 2 ditolak dengan pesan konflik; perubahan tab 1 tidak tertimpa; katalog utuh | |
| 3.3 | Tambah/urutkan/nonaktifkan link; link `javascript:` | Link valid tersimpan; `javascript:`/`data:` ditolak | |

## 4. Publish, republish, unpublish
| # | Langkah | Hasil | ✅/❌ |
|---|---|---|---|
| 4.1 | Sebelum terbit, buka `$URL/<username>` di jendela privat | 404 | |
| 4.2 | Terbitkan | Halaman publik tampil sesuai draft | |
| 4.3 | Ubah draft **tanpa** terbit; muat ulang halaman publik | Publik tetap versi terbit; preview = draft | |
| 4.4 | Terbitkan ulang (republish) | Publik berubah **segera** (cek `revalidatePath` — jika masih lama, catat: ISR belum terbukti) | |
| 4.5 | Hapus objek aset draft lewat Dashboard Storage, klik Terbitkan | Gagal dengan pesan jelas; halaman publik tetap versi sebelumnya | |
| 4.6 | Batalkan penerbitan | Publik 404; draft tetap ada | |
| 4.7 | Terbitkan lagi | Halaman kembali | |
| 4.8 | Lihat sumber halaman publik | `<title>`, `canonical` = `NEXT_PUBLIC_SITE_URL`/username, tag Open Graph | |

## 5. Katalog, upload, dan CTA
| # | Langkah | Hasil | ✅/❌ |
|---|---|---|---|
| 5.1 | Tambah item katalog + 1–7 foto (JPG/PNG/WebP < 5 MB) | Upload berhasil; sampul otomatis | |
| 5.2 | Unggah `.gif`/`.svg`/>5 MB | Ditolak | |
| 5.3 | CTA **WhatsApp** dengan nomor + template pesan | Tombol membuka `wa.me/<nomor>?text=…` dengan pesan terisi (uji di ponsel) | |
| 5.4 | CTA URL/email/telepon | `https://`, `mailto:`, `tel:` benar; skema berbahaya ditolak | |
| 5.5 | Terbitkan; buka `$URL/<username>` dan modal detail/galeri | Katalog tampil; slideshow berjalan; `prefers-reduced-motion` menghormati | |
| 5.6 | Draft katalog yang belum terbit | Tidak muncul di halaman publik | |

## 6. Isolasi dua akun dan cache
| # | Langkah | Hasil | ✅/❌ |
|---|---|---|---|
| 6.1 | B masuk; coba buka editor/preview milik A (URL/ID) | Tidak ada data A | |
| 6.2 | B (konsol/`supabase-js` dengan sesi B): `from('pages').select()` | Hanya baris B | |
| 6.3 | B: `from('pages').delete()` / `insert()` | Ditolak (hak dicabut migration 9) | |
| 6.4 | B: `rpc('publish_page', …)` | Ditolak | |
| 6.5 | Tanpa login: `rpc('is_username_available', …)` dengan anon key | Ditolak | |
| 6.6 | B menulis ke path `<uidA>/avatar/x.png` di Storage | Ditolak policy | |
| 6.7 | Halaman privat (`/dashboard`, `/login`) — lihat header respons | `Cache-Control: private, no-store` | |
| 6.8 | Halaman publik — header respons | Bisa di-cache (ISR); tidak ada cookie sesi | |
| 6.9 | Perilaku cache: A terbitkan perubahan, lalu B/anon muat halaman A | Konten baru terlihat segera atau dalam batas `revalidate` (catat waktu) | |

## 7. Responsif dan perangkat nyata (belum terbukti oleh CI)
Cek halaman publik dan editor di ponsel Android, iPhone (Safari), tablet, dan desktop; perhatikan fokus keyboard dan pembaca layar. CI hanya menguji Chromium pada lebar 320–1920 px dengan komponen asli (bukan Safari iOS/Android nyata).

## Hasil
Selesai bila semua baris ✅. Setiap ❌: simpan layar/galat (tanpa secret) dan kirim ke saya; jangan menaikkan status ke production-ready.
