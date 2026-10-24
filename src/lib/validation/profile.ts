// Validasi profil untuk editor (nama tampilan + bio). Modul murni; batas sama dengan constraint tabel profiles.
import { validateDisplayName, type FieldErrors, type Validated } from "./auth.ts";
import { validateUsername } from "./username.ts";

export const BIO_MAX_LENGTH = 500;
// Bio boleh berbaris baru (\n) tetapi tidak karakter kontrol lain.
// eslint-disable-next-line no-control-regex
const BAD_BIO_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

export type ProfileInput = { displayName: string; bio: string; username: string };

export function validateProfileInput(raw: { displayName: unknown; bio: unknown; username: unknown }): Validated<ProfileInput> {
  const errors: FieldErrors = {};
  const name = validateDisplayName(raw.displayName);
  if (!name.ok) errors.displayName = name.message;

  const bio = typeof raw.bio === "string" ? raw.bio.replace(/\r\n/g, "\n").trim() : "";
  if (Array.from(bio).length > BIO_MAX_LENGTH) errors.bio = `Bio maksimal ${BIO_MAX_LENGTH} karakter.`;
  else if (BAD_BIO_CHARS.test(bio)) errors.bio = "Bio mengandung karakter yang tidak diizinkan.";

  const username = validateUsername(raw.username);
  if (!username.ok) errors.username = username.message;

  if (Object.keys(errors).length > 0 || !name.ok || !username.ok) return { ok: false, errors };
  return { ok: true, value: { displayName: name.value, bio, username: username.value } };
}
