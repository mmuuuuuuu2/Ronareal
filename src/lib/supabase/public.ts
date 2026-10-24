import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config.ts";

/**
 * Klien Supabase TANPA cookie/sesi untuk halaman publik. Memakai kunci anon; hanya dapat memanggil fungsi yang
 * di-grant ke anon (get_public_page). Tidak membaca cookies()/headers() sehingga rute publik dapat di-cache (ISR).
 * Dibuat per-permintaan; tidak menyimpan sesi.
 */
export function createSupabasePublicClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
