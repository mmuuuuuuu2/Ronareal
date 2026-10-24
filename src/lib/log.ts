// Logging server yang aman — modul murni (hanya memanggil console.error). Tidak pernah mencatat objek galat mentah:
// hanya nama, kode, status, dan pesan yang sudah disamarkan (JWT, Bearer, pasangan kunci=nilai sensitif, token panjang, email).
export function redact(input: string): string {
  return input
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[jwt]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(password|passwd|pwd|token|secret|api[_-]?key|apikey|authorization|cookie|refresh_token|access_token)\b\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sb_(?:publishable|secret)_[A-Za-z0-9_-]+)/g, "[key]")
    .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[long-token]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
}

export type SafeLogEntry = { scope: string; name?: string; code?: string; status?: number; message: string };

export function toSafeEntry(scope: string, error: unknown): SafeLogEntry {
  const e = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : { message: String(error) };
  return {
    scope,
    ...(typeof e.name === "string" ? { name: e.name.slice(0, 60) } : {}),
    ...(typeof e.code === "string" ? { code: e.code.slice(0, 60) } : {}),
    ...(typeof e.status === "number" ? { status: e.status } : {}),
    message: redact(typeof e.message === "string" ? e.message : "").slice(0, 200),
  };
}

/** Mencatat galat server tanpa rahasia. Tidak pernah dilempar; tidak mengubah alur pemanggil. */
export function logServerError(scope: string, error: unknown): void {
  try {
    console.error("[rona]", JSON.stringify(toSafeEntry(scope, error)));
  } catch {
    /* logging tidak boleh menggagalkan permintaan */
  }
}
