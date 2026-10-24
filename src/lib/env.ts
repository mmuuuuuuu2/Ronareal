// Parsing & validasi environment — modul murni (tanpa akses process.env) agar bisa diuji.
// Nilai kunci TIDAK PERNAH dimasukkan ke pesan galat.
import { inspectSupabaseKey } from "./supabase/key-check.ts";

export type SupabaseEnv = { url: string; anonKey: string };
export type EnvResult = { ok: true; value: SupabaseEnv } | { ok: false; problems: string[] };

export function parseSupabaseEnv(input: {
  url?: string | undefined;
  anonKey?: string | undefined;
}): EnvResult {
  const problems: string[] = [];
  const url = (input.url ?? "").trim();
  const anonKey = (input.anonKey ?? "").trim();

  if (!url) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL belum diisi.");
  } else {
    try {
      const parsed = new URL(url);
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
        problems.push("NEXT_PUBLIC_SUPABASE_URL harus diawali https:// (http:// hanya untuk localhost).");
      }
      if (parsed.pathname !== "/" && parsed.pathname !== "") {
        problems.push("NEXT_PUBLIC_SUPABASE_URL harus berupa alamat dasar proyek, tanpa path tambahan.");
      }
    } catch {
      problems.push("NEXT_PUBLIC_SUPABASE_URL bukan URL yang valid.");
    }
  }

  if (!anonKey) {
    problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi.");
  } else {
    const inspection = inspectSupabaseKey(anonKey);
    if (!inspection.ok) problems.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${inspection.reason}`);
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: { url: url.replace(/\/+$/, ""), anonKey } };
}

/** Mengembalikan origin (tanpa path/slash akhir) bila valid, selain itu null. */
export function normalizeSiteUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Origin tepercaya untuk URL publik/canonical: HANYA dari konfigurasi server (NEXT_PUBLIC_SITE_URL), tidak pernah dari
 * header Host/Origin permintaan (yang dapat dipalsukan). Di luar produksi boleh jatuh ke localhost; di produksi tanpa
 * konfigurasi valid hasilnya null (pemanggil harus menolak/menghilangkan URL absolut, bukan menebak).
 */
export function resolveSiteUrl(raw: string | undefined | null, nodeEnv: string | undefined): string | null {
  const configured = normalizeSiteUrl(raw);
  if (configured) return configured;
  return nodeEnv === "production" ? null : "http://localhost:3000";
}
