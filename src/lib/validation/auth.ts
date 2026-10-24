// Validasi input autentikasi & profil — modul murni. Validasi client hanya untuk UX;
// server action selalu memvalidasi ulang, dan database memvalidasi lagi (defense in depth).

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72; // batas bcrypt yang dipakai Supabase Auth
export const DISPLAY_NAME_MAX_LENGTH = 80;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

export function normalizeEmail(raw: unknown): string {
  return asString(raw).trim().toLowerCase();
}

export function emailError(email: string): string | null {
  if (!email) return "Email wajib diisi.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return "Format email tidak valid.";
  }
  return null;
}

export function passwordError(password: string): string | null {
  if (!password) return "Kata sandi wajib diisi.";
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "Kata sandi terlalu panjang (maksimal 72 byte).";
  }
  return null;
}

export function validateLogin(input: {
  email: unknown;
  password: unknown;
}): Validated<{ email: string; password: string }> {
  const email = normalizeEmail(input.email);
  const password = asString(input.password);
  const errors: FieldErrors = {};

  const eErr = emailError(email);
  if (eErr) errors.email = eErr;
  // Saat login, aturan panjang tidak ditegakkan (akun lama); cukup tidak kosong.
  if (!password) errors.password = "Kata sandi wajib diisi.";

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { email, password } };
}

export function validateRegistration(input: {
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
}): Validated<{ email: string; password: string }> {
  const email = normalizeEmail(input.email);
  const password = asString(input.password);
  const confirm = asString(input.confirmPassword);
  const errors: FieldErrors = {};

  const eErr = emailError(email);
  if (eErr) errors.email = eErr;
  const pErr = passwordError(password);
  if (pErr) errors.password = pErr;
  if (!pErr && password !== confirm) errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { email, password } };
}

export type DisplayNameValidation = { ok: true; value: string } | { ok: false; message: string };

export function validateDisplayName(raw: unknown): DisplayNameValidation {
  const value = asString(raw).trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, message: "Nama tampilan wajib diisi." };
  if (CONTROL_CHARS.test(value)) return { ok: false, message: "Nama tampilan mengandung karakter yang tidak diizinkan." };
  if (Array.from(value).length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, message: `Nama tampilan maksimal ${DISPLAY_NAME_MAX_LENGTH} karakter.` };
  }
  return { ok: true, value };
}
