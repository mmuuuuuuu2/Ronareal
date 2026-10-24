// Validasi input link — modul murni. Batas panjang HARUS sama dengan constraint tabel page_links.
import { validateLinkUrl } from "./url.ts";
import type { FieldErrors, Validated } from "./auth.ts";
import { LINK_ICON_KEYS, type LinkIconKey } from "../editor/icons.ts";

export const LINK_TITLE_MAX = 120;
export const LINK_DESCRIPTION_MAX = 300;
export const MAX_LINKS_PER_PAGE = 50; // sama dengan trigger page_links_guard

export type LinkInput = {
  title: string;
  url: string;
  description: string;
  icon: LinkIconKey | null;
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

function str(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

export function validateLink(raw: {
  title: unknown;
  url: unknown;
  description?: unknown;
  icon?: unknown;
}): Validated<LinkInput> {
  const errors: FieldErrors = {};
  const title = str(raw.title).trim();
  const description = str(raw.description).trim();

  if (!title) errors.title = "Judul wajib diisi.";
  else if (Array.from(title).length > LINK_TITLE_MAX) errors.title = `Judul maksimal ${LINK_TITLE_MAX} karakter.`;
  else if (CONTROL.test(title)) errors.title = "Judul tidak boleh mengandung karakter kontrol.";

  const url = validateLinkUrl(raw.url);
  if (!url.ok) errors.url = url.message;

  if (Array.from(description).length > LINK_DESCRIPTION_MAX) {
    errors.description = `Deskripsi maksimal ${LINK_DESCRIPTION_MAX} karakter.`;
  } else if (CONTROL.test(description)) {
    errors.description = "Deskripsi tidak boleh mengandung karakter kontrol.";
  }

  let icon: LinkIconKey | null = null;
  if (raw.icon !== null && raw.icon !== undefined && raw.icon !== "") {
    if (typeof raw.icon === "string" && (LINK_ICON_KEYS as readonly string[]).includes(raw.icon)) {
      icon = raw.icon as LinkIconKey;
    } else {
      errors.icon = "Ikon tidak dikenal.";
    }
  }

  if (Object.keys(errors).length > 0 || !url.ok) return { ok: false, errors };
  return { ok: true, value: { title, url: url.value, description, icon } };
}
