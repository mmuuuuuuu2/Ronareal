// Pagar keamanan: memastikan kunci yang dipakai di aplikasi adalah kunci publik (anon/publishable),
// bukan secret/service_role. Modul murni; hanya membaca klaim JWT tanpa memverifikasi tanda tangan.

export type KeyInspection = { ok: true } | { ok: false; reason: string };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function inspectSupabaseKey(key: string): KeyInspection {
  const value = key.trim();
  if (!value) return { ok: false, reason: "Kunci kosong." };
  if (value.startsWith("sb_secret_")) {
    return { ok: false, reason: "Ini secret key. Jangan pernah dipakai di aplikasi web; gunakan anon/publishable key." };
  }
  if (value.startsWith("sb_publishable_")) return { ok: true };

  const payload = decodeJwtPayload(value);
  if (!payload) return { ok: false, reason: "Format kunci tidak dikenali (harus JWT anon atau sb_publishable_...)." };
  if (payload.role === "service_role") {
    return { ok: false, reason: "Ini service_role key. Jangan pernah dipakai di aplikasi web; gunakan anon/publishable key." };
  }
  if (payload.role !== "anon") {
    return { ok: false, reason: "Klaim role kunci bukan 'anon'." };
  }
  return { ok: true };
}
