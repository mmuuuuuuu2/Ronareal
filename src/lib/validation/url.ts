// Validasi URL tautan — modul murni. Dipakai di client (umpan balik cepat), di server action (wajib),
// dan dicerminkan oleh constraint `page_links_url_scheme` di database (pertahanan berlapis).
// Hanya http, https, mailto, dan tel yang boleh menjadi tujuan navigasi. javascript:, data:, vbscript:, file:, blob:
// dan skema lain ditolak.

export const URL_MAX_LENGTH = 2048;
export const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"] as const;
export type AllowedScheme = (typeof ALLOWED_SCHEMES)[number];

export type UrlValidation =
  | { ok: true; value: string; scheme: AllowedScheme }
  | { ok: false; message: string };

// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = new RegExp("[\\x00-\\x20\\x7F-\\x9F" + String.fromCharCode(0x2028, 0x2029) + "]");
const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;
const HOST_WITH_PORT = /^[^/?#:]+:\d+(?:[/?#]|$)/; // "localhost:3000/x" bukan skema
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const TEL = /^\+?[0-9()-]{3,30}$/;

const fail = (message: string): UrlValidation => ({ ok: false, message });

/**
 * Merapikan dan memvalidasi URL. Input tanpa skema (mis. "contoh.com/halaman") dilengkapi "https://".
 * Hasil `value` selalu sudah ternormalisasi dan lolos regex constraint database.
 */
export function validateLinkUrl(raw: unknown): UrlValidation {
  if (typeof raw !== "string") return fail("URL wajib diisi.");
  const input = raw.trim();
  if (!input) return fail("URL wajib diisi.");
  if (input.length > URL_MAX_LENGTH) return fail(`URL terlalu panjang (maksimal ${URL_MAX_LENGTH} karakter).`);
  if (CONTROL_OR_SPACE.test(input)) return fail("URL tidak boleh mengandung spasi atau karakter kontrol.");

  const schemeMatch = SCHEME_PREFIX.exec(input);
  const hasScheme = schemeMatch !== null && !HOST_WITH_PORT.test(input);

  if (hasScheme) {
    const scheme = (schemeMatch?.[1] ?? "").toLowerCase();
    if (scheme === "mailto") {
      const address = input.slice("mailto:".length).split("?")[0] ?? "";
      if (!EMAIL.test(address)) return fail("Alamat email pada mailto: tidak valid.");
      return { ok: true, value: `mailto:${input.slice("mailto:".length)}`, scheme: "mailto" };
    }
    if (scheme === "tel") {
      const number = input.slice("tel:".length);
      if (!TEL.test(number) || !/[0-9]{3,}/.test(number.replace(/[()-]/g, ""))) {
        return fail("Nomor telepon pada tel: tidak valid.");
      }
      return { ok: true, value: `tel:${number}`, scheme: "tel" };
    }
    if (scheme !== "http" && scheme !== "https") {
      return fail("Hanya tautan http://, https://, mailto: atau tel: yang diizinkan.");
    }
    if (!/^https?:\/\//i.test(input)) return fail("Format URL tidak valid. Gunakan https://contoh.com");
    return parseWebUrl(input, scheme);
  }

  // Tanpa skema: harus tampak seperti host (mengandung titik atau localhost), bukan teks bebas.
  if (input.startsWith("//") || input.startsWith("/")) return fail("Masukkan URL lengkap, mis. https://contoh.com");
  if (!/^[^\s/?#]+\.[^\s/?#]+/.test(input) && !/^localhost(?::\d+)?(?:[/?#]|$)/i.test(input)) {
    return fail("Format URL tidak valid. Gunakan https://contoh.com");
  }
  return parseWebUrl(`https://${input}`, "https");
}

function parseWebUrl(candidate: string, scheme: "http" | "https"): UrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fail("Format URL tidak valid. Gunakan https://contoh.com");
  }
  if (parsed.protocol !== `${scheme}:`) return fail("Format URL tidak valid.");
  if (parsed.username || parsed.password) return fail("URL tidak boleh memuat nama pengguna/kata sandi.");
  if (!parsed.hostname) return fail("URL harus memiliki nama host.");
  // Pertahankan teks yang diketik pengguna (selain skema/host huruf kecil) agar tidak mengubah tautan secara tak terduga.
  return { ok: true, value: candidate, scheme };
}

/** Untuk render: href hanya diberikan bila URL lolos validasi (pertahanan terakhir di sisi tampilan). */
export function safeHref(raw: unknown): string | null {
  const result = validateLinkUrl(raw);
  return result.ok ? result.value : null;
}
