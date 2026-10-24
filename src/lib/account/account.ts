// Validasi & status akun (Phase 7) — modul murni. Kata sandi TIDAK PERNAH disimpan/dicatat; hanya diteruskan ke Supabase Auth.
import { emailError, normalizeEmail, passwordError, type FieldErrors, type Validated } from "../validation/auth.ts";

export function validateEmailChange(rawNew: unknown, currentEmail: string | null | undefined): Validated<{ email: string }> {
  const email = normalizeEmail(rawNew);
  const err = emailError(email);
  if (err) return { ok: false, errors: { email: err } };
  if (currentEmail && email === normalizeEmail(currentEmail)) {
    return { ok: false, errors: { email: "Email baru sama dengan email saat ini." } };
  }
  return { ok: true, value: { email } };
}

export function validateNewPassword(password: unknown, confirm: unknown): Validated<{ password: string }> {
  const pw = typeof password === "string" ? password : "";
  const cf = typeof confirm === "string" ? confirm : "";
  const errors: FieldErrors = {};
  const e = passwordError(pw);
  if (e) errors.password = e;
  else if (pw !== cf) errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { password: pw } };
}

export type EmailStatus = { current: string; pending: string | null };

/**
 * Status email dari objek user Supabase. `new_email` terisi HANYA selama perubahan menunggu konfirmasi; email aktif
 * (`email`) baru berganti setelah Supabase mengonfirmasi. Perubahan tidak pernah dianggap selesai sebelum itu.
 */
export function emailStatus(user: { email?: string | null; new_email?: string | null }): EmailStatus {
  const current = user.email ?? "";
  const pending = typeof user.new_email === "string" && user.new_email && user.new_email !== current ? user.new_email : null;
  return { current, pending };
}

/** Tanggal/waktu singkat Indonesia untuk info sesi. Input tak valid -> null. */
export function formatWhen(iso: unknown, timeZone = "Asia/Jakarta"): string | null {
  if (typeof iso !== "string") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
}
