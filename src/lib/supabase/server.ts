import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config.ts";

/**
 * Klien Supabase untuk Server Components, Server Actions, dan Route Handlers (membaca/menulis cookie sesi).
 * Dibuat per-permintaan; jangan disimpan di variabel global (mencegah kebocoran sesi antar pengguna).
 * Aplikasi sengaja TIDAK memakai klien Supabase di browser: semua akses lewat server.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Dipanggil dari Server Component (cookie tidak bisa ditulis). Aman diabaikan:
          // middleware yang menyegarkan sesi pada setiap permintaan ke rute yang dilindungi.
        }
      },
    },
  });
}
