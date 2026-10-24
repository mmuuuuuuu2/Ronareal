import { cache } from "react";
import { createSupabaseServerClient } from "../supabase/server.ts";
import type { PageRow, ProfileRow } from "../data/types.ts";

// Dibungkus cache() React agar layout dan halaman pada SATU permintaan berbagi hasil (tanpa query berulang).
// Cache ini hanya hidup selama satu render permintaan, tidak dibagi antar pengguna.

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (userId: string): Promise<ProfileRow | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Profil tidak dapat dimuat.");
  return (data as ProfileRow | null) ?? null;
});

export const getOwnPage = cache(async (userId: string): Promise<PageRow | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pages")
    .select("id, is_published, updated_at")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error("Halaman tidak dapat dimuat.");
  return (data as PageRow | null) ?? null;
});
