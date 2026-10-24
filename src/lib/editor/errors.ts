// Pemetaan error database/storage -> pesan pengguna (Indonesia). Modul murni. Tidak pernah meneruskan pesan mentah server.
export type EditorErrorLike = { message?: string; code?: string; status?: number; statusCode?: string | number } | null | undefined;

export type MappedEditorError = { message: string; field?: string; retryable: boolean };

export function mapEditorError(error: EditorErrorLike): MappedEditorError {
  const text = `${error?.message ?? ""}`;
  const has = (s: string) => text.includes(s);

  if (has("not_authenticated") || error?.status === 401) {
    return { message: "Sesi Anda berakhir. Silakan masuk kembali.", retryable: false };
  }
  if (has("draft_conflict_seo")) {
    return {
      message: "Pengaturan SEO ini sudah diubah dari tab atau perangkat lain. Isian Anda belum disimpan dan masih ada di layar. Muat ulang untuk melihat versi terbaru, lalu terapkan kembali perubahan Anda.",
      retryable: false,
    };
  }
  if (has("seo_invalid")) return { message: "Isian SEO tidak valid. Periksa batas karakter dan pilihan Anda.", retryable: false };
  if (has("username_recently_released")) {
    return { field: "username", message: "Username ini baru saja dilepas pemiliknya dan dicadangkan selama 30 hari. Coba yang lain.", retryable: false };
  }
  if (has("draft_conflict")) {
    return {
      message: "Draft ini sudah diubah dari tab atau perangkat lain. Perubahan Anda belum disimpan dan masih ada di layar. Muat ulang untuk melihat versi terbaru, lalu terapkan kembali perubahan Anda.",
      retryable: false,
    };
  }
  if (has("draft_invalid")) return { message: "Isian profil atau tampilan tidak valid. Periksa kembali.", retryable: false };
  if (has("username_taken")) return { field: "username", message: "Username ini sudah dipakai pengguna lain.", retryable: false };
  if (has("username_reserved")) return { field: "username", message: "Username ini dicadangkan sistem.", retryable: false };
  if (has("username_invalid")) return { field: "username", message: "Format username tidak valid.", retryable: false };
  if (has("username_locked_published")) {
    return { field: "username", message: "Username tidak dapat diubah selama halaman diterbitkan. Batalkan penerbitan dulu.", retryable: false };
  }
  if (has("assets_not_published")) {
    return { message: "Gambar belum berhasil disalin ke penyimpanan publik. Coba terbitkan lagi.", retryable: true };
  }
  if (has("assets_invalid")) return { message: "Data gambar tidak valid. Muat ulang halaman lalu coba lagi.", retryable: false };
  if (has("no_visible_links")) return { message: "Tampilkan minimal satu tautan sebelum menerbitkan.", retryable: false };
  if (has("display_name_required")) return { message: "Isi nama tampilan sebelum menerbitkan.", retryable: false };
  if (has("link_url_invalid")) return { message: "Ada tautan dengan URL yang tidak valid. Perbaiki lalu terbitkan lagi.", retryable: false };
  if (has("page_not_found")) return { message: "Halaman Anda tidak ditemukan. Muat ulang halaman ini.", retryable: false };
  if (has("link_limit_reached")) return { message: "Jumlah tautan sudah mencapai batas (50).", retryable: false };
  if (has("reorder_mismatch")) {
    return { message: "Daftar tautan berubah di tempat lain. Muat ulang halaman lalu atur urutan lagi.", retryable: false };
  }
  if (has("catalog_item_limit_reached")) return { message: "Jumlah item katalog sudah mencapai batas (30).", retryable: false };
  if (has("catalog_image_limit_reached")) return { message: "Satu item maksimal 7 foto.", retryable: false };
  if (has("catalog_item_not_found") || has("catalog_image_not_found")) {
    return { message: "Item atau foto tidak ditemukan atau bukan milik Anda. Muat ulang halaman.", retryable: false };
  }
  if (has("image_object_missing")) return { message: "File foto tidak ditemukan di penyimpanan. Unggah ulang foto tersebut.", retryable: true };
  if (has("catalog_title_invalid")) return { field: "title", message: "Judul section wajib diisi (maksimal 40 karakter).", retryable: false };
  if (has("catalog_items_cta_format")) return { field: "ctaValue", message: "Tujuan tombol tidak valid untuk jenis yang dipilih.", retryable: false };
  if (has("catalog_items_")) return { message: "Isian item katalog melebihi batas atau tidak valid. Periksa kembali.", retryable: false };
  if (has("catalog_images_")) return { message: "Data foto katalog tidak valid.", retryable: false };
  if (has("page_links_url_scheme")) {
    return { field: "url", message: "URL ditolak. Hanya http, https, mailto, dan tel yang diizinkan.", retryable: false };
  }
  if (has("image_path_invalid")) return { message: "Lokasi gambar tidak valid.", retryable: false };
  if (has("pages_draft_config")) return { message: "Pengaturan halaman tidak valid.", retryable: false };
  if (has("row-level security") || has("permission denied")) {
    return { message: "Anda tidak memiliki akses ke data ini.", retryable: false };
  }
  if (error?.status === 0 || /fetch failed|network|timeout|ECONN|ENOTFOUND/i.test(text)) {
    return { message: "Tidak dapat terhubung ke layanan. Periksa koneksi lalu coba lagi.", retryable: true };
  }
  return { message: "Perubahan belum dapat disimpan. Data Anda masih ada di layar; coba lagi.", retryable: true };
}

/** Pesan untuk galat unggah dari Supabase Storage. */
export function mapUploadError(error: EditorErrorLike): MappedEditorError {
  const text = `${error?.message ?? ""}`;
  if (/exceeded|too large|payload|413/i.test(text) || error?.statusCode === "413" || error?.statusCode === 413) {
    return { message: "Ukuran gambar melebihi batas (5 MB).", retryable: false };
  }
  if (/mime|invalid.*type|not allowed/i.test(text)) {
    return { message: "Format gambar tidak diizinkan (gunakan JPG, PNG, atau WebP).", retryable: false };
  }
  if (/row-level security|unauthorized|403|permission/i.test(text)) {
    return { message: "Anda tidak memiliki izin mengunggah ke lokasi ini.", retryable: false };
  }
  if (/fetch failed|network|timeout|ECONN|ENOTFOUND/i.test(text) || error?.status === 0) {
    return { message: "Koneksi terputus saat mengunggah. Coba lagi.", retryable: true };
  }
  return { message: "Gambar belum dapat diunggah. Coba lagi.", retryable: true };
}
