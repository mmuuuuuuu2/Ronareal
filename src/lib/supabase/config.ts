import { parseSupabaseEnv, type SupabaseEnv } from "../env.ts";

/**
 * Membaca konfigurasi publik Supabase. process.env.NEXT_PUBLIC_* HARUS ditulis literal agar Next.js
 * menggantinya saat build. Hanya URL + anon/publishable key yang dipakai; tidak ada kunci rahasia di aplikasi.
 */
export function getSupabaseConfig(): SupabaseEnv {
  const result = parseSupabaseEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!result.ok) {
    // Pesan hanya berisi nama variabel & alasan, tidak pernah nilai kunci.
    throw new Error(`Konfigurasi Supabase tidak valid: ${result.problems.join(" ")}`);
  }
  return result.value;
}
