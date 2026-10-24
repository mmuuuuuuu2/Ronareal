// Validasi username — modul murni (tanpa dependency) agar bisa diuji langsung dengan `node --test`.
// Database tetap sumber kebenaran: pola di bawah HARUS identik dengan constraint `profiles_username_format`
// dan fungsi claim_profile()/is_username_available() di supabase/migrations (dijaga oleh tests/username.test.ts).
// Daftar username reserved TIDAK ditiru di sini; pengecekan reserved/terpakai dilakukan database.

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

export type UsernameErrorCode =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "invalid_edge";

export type UsernameValidation =
  | { ok: true; value: string }
  | { ok: false; code: UsernameErrorCode; message: string };

/** trim + huruf kecil. Selalu menghasilkan string (kosong bila input bukan string). */
export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function validateUsername(raw: unknown): UsernameValidation {
  const value = normalizeUsername(raw);

  if (value.length === 0) {
    return { ok: false, code: "empty", message: "Username wajib diisi." };
  }
  if (value.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      code: "too_short",
      message: `Username minimal ${USERNAME_MIN_LENGTH} karakter.`,
    };
  }
  if (value.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      code: "too_long",
      message: `Username maksimal ${USERNAME_MAX_LENGTH} karakter.`,
    };
  }
  if (!/^[a-z0-9_-]+$/.test(value)) {
    return {
      ok: false,
      code: "invalid_chars",
      message: "Gunakan hanya huruf kecil, angka, tanda hubung (-) atau garis bawah (_).",
    };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return {
      ok: false,
      code: "invalid_edge",
      message: "Username harus diawali dan diakhiri huruf atau angka.",
    };
  }
  return { ok: true, value };
}
