// Tipe baris minimal sesuai migration. Belum memakai tipe hasil `supabase gen types` (butuh akses ke proyek);
// ganti dengan tipe terbitan setelah itu tersedia. Pilih hanya kolom yang dibutuhkan di setiap query.

export type ProfileRow = {
  username: string;
  display_name: string | null;
};

export type PageRow = {
  id: string;
  is_published: boolean;
  updated_at: string;
};
