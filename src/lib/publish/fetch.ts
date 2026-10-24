import { cache } from "react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { validateUsername } from "@/lib/validation/username";
import { parsePublicSnapshot, type PublicPage } from "./snapshot.ts";

export type PublicLookup = { kind: "ok"; page: PublicPage } | { kind: "not-found" };

/**
 * Satu RPC (get_public_page) memuat semua yang dibutuhkan halaman: profil, visual, link aktif, aset. Tidak ada query
 * tambahan. cache() React men-dedup panggilan dari generateMetadata dan page pada render yang sama.
 * Galat jaringan/server DILEMPAR (bukan dianggap 404) agar halaman error tidak ter-cache sebagai "tidak ditemukan".
 */
export const fetchPublicPage = cache(async (rawUsername: string): Promise<PublicLookup> => {
  const username = validateUsername(rawUsername);
  if (!username.ok) return { kind: "not-found" }; // username tak valid: tidak perlu menyentuh database
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_public_page", { p_username: username.value });
  if (error) throw new Error("Halaman publik tidak dapat dimuat.");
  if (data === null || data === undefined) return { kind: "not-found" };
  const page = parsePublicSnapshot(data, getSupabaseConfig().url);
  return page ? { kind: "ok", page } : { kind: "not-found" };
});
