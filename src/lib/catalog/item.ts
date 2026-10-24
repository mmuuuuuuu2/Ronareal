// Validasi item katalog — modul murni. Dijalankan di client (umpan balik cepat) dan SERVER (wajib); database
// menegakkan batas yang sama lewat constraint/trigger. Teks mendukung Unicode penuh (emoji, aksara Indonesia).
// Panjang dihitung per code point (sama dengan char_length PostgreSQL), bukan per UTF-16 unit.
import { CTA_LABEL_MAX, CTA_MESSAGE_MAX, isCtaType, normalizeCtaValue, type CtaType } from "./cta.ts";

export const MAX_ITEMS_PER_PAGE = 30;
export const MAX_PHOTOS_PER_ITEM = 7;
export const SECTION_TITLE_MAX = 40;
export const DEFAULT_SECTION_TITLE = "Layanan";
export const LIMITS = { title: 120, summary: 160, description: 2000, priceLabel: 40 } as const;
export const MAX_PRICE = 999_999_999_999;

export const PRICE_LABEL_SUGGESTIONS = ["Mulai dari", "Paket", "Hubungi untuk harga"] as const;

/** Nilai mentah dari formulir (semua string). */
export type ItemFields = {
  title: string;
  summary: string;
  description: string;
  priceAmount: string;
  priceLabel: string;
  ctaType: CtaType | "";
  ctaValue: string;
  ctaLabel: string;
  ctaMessage: string;
};

export const EMPTY_ITEM_FIELDS: ItemFields = {
  title: "", summary: "", description: "", priceAmount: "", priceLabel: "",
  ctaType: "", ctaValue: "", ctaLabel: "", ctaMessage: "",
};

/** Nilai tervalidasi yang ditulis ke database (null = kosong). */
export type ItemValue = {
  title: string;
  summary: string | null;
  description: string | null;
  priceAmount: number | null;
  priceLabel: string | null;
  ctaType: CtaType | null;
  ctaValue: string | null;
  ctaLabel: string | null;
  ctaMessage: string | null;
};

export type ItemValidation =
  | { ok: true; value: ItemValue }
  | { ok: false; errors: Record<string, string> };

// eslint-disable-next-line no-control-regex
const CONTROL_KEEP_NL = new RegExp("[\\x00-\\x09\\x0B-\\x1F\\x7F]", "g");
// eslint-disable-next-line no-control-regex
const CONTROL_ALL = new RegExp("[\\x00-\\x1F\\x7F]", "g");

const cpLength = (s: string) => Array.from(s).length;

type Clean = { ok: true; value: string } | { ok: false; message: string };

/** Membersihkan teks: karakter kontrol dibuang, baris baru hanya untuk teks multibaris, lalu dibatasi panjangnya. */
export function cleanText(raw: unknown, max: number, label: string, multiline = false): Clean {
  if (raw === undefined || raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, message: `${label} tidak valid.` };
  let s = raw.normalize("NFC").replace(/\r\n?/g, "\n");
  s = multiline ? s.replace(CONTROL_KEEP_NL, "") : s.replace(/\n+/g, " ").replace(CONTROL_ALL, "");
  s = s.trim();
  if (cpLength(s) > max) return { ok: false, message: `${label} maksimal ${max} karakter.` };
  return { ok: true, value: s };
}

export type PriceResult = { ok: true; value: number | null } | { ok: false; message: string };

/** "1500000", "1.500.000", "1,500,000" -> 1500000. Kosong -> null. Desimal/negatif/huruf ditolak. */
export function parsePrice(raw: unknown): PriceResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw < 0 || raw > MAX_PRICE) return { ok: false, message: "Harga tidak valid." };
    return { ok: true, value: raw };
  }
  if (typeof raw !== "string") return { ok: false, message: "Harga tidak valid." };
  const s = raw.trim().replace(/^rp\.?\s*/i, "").replace(/\s/g, "");
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s) && !/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    return { ok: false, message: "Harga hanya berisi angka bulat, mis. 1500000 atau 1.500.000." };
  }
  const n = Number(s.replace(/[.,]/g, ""));
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_PRICE) return { ok: false, message: "Harga terlalu besar." };
  return { ok: true, value: n };
}

/** 1500000 -> "Rp 1.500.000" (pemisah ribuan manual agar hasil sama di semua lingkungan). */
export function formatRupiah(amount: number): string {
  return `Rp ${String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Teks harga untuk tampilan: "Mulai dari Rp 1.500.000", "Rp 500.000", atau hanya label ("Hubungi untuk harga"). */
export function formatPrice(amount: number | null, label: string | null): string | null {
  const l = label && label.trim() ? label.trim() : null;
  if (amount === null || !Number.isFinite(amount) || amount < 0) return l;
  return l ? `${l} ${formatRupiah(amount)}` : formatRupiah(amount);
}

export function validateSectionTitle(raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const c = cleanText(raw, SECTION_TITLE_MAX, "Judul section");
  if (!c.ok) return c;
  if (!c.value) return { ok: false, message: "Judul section wajib diisi." };
  return c;
}

/** Validasi lengkap satu item. Dipakai server sebelum menulis; hasil `value` lolos semua constraint database. */
export function validateItem(input: unknown): ItemValidation {
  const o = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const errors: Record<string, string> = {};

  const title = cleanText(o.title, LIMITS.title, "Judul");
  if (!title.ok) errors.title = title.message;
  else if (!title.value) errors.title = "Judul wajib diisi.";

  const summary = cleanText(o.summary, LIMITS.summary, "Deskripsi singkat");
  if (!summary.ok) errors.summary = summary.message;
  const description = cleanText(o.description, LIMITS.description, "Deskripsi lengkap", true);
  if (!description.ok) errors.description = description.message;
  const priceLabel = cleanText(o.priceLabel, LIMITS.priceLabel, "Label harga");
  if (!priceLabel.ok) errors.priceLabel = priceLabel.message;
  const price = parsePrice(o.priceAmount);
  if (!price.ok) errors.priceAmount = price.message;

  const ctaLabel = cleanText(o.ctaLabel, CTA_LABEL_MAX, "Label tombol");
  if (!ctaLabel.ok) errors.ctaLabel = ctaLabel.message;
  const ctaMessage = cleanText(o.ctaMessage, CTA_MESSAGE_MAX, "Template pesan", true);
  if (!ctaMessage.ok) errors.ctaMessage = ctaMessage.message;

  const rawType = o.ctaType === undefined || o.ctaType === null || o.ctaType === "" ? null : o.ctaType;
  const rawValue = typeof o.ctaValue === "string" ? o.ctaValue.trim() : o.ctaValue ?? "";
  let ctaType: CtaType | null = null;
  let ctaValue: string | null = null;
  if (rawType !== null && !isCtaType(rawType)) {
    errors.ctaType = "Jenis tujuan tidak dikenal.";
  } else if (rawType !== null) {
    if (rawValue === "") errors.ctaValue = "Isi tujuan CTA, atau pilih \"Tanpa tombol\".";
    else {
      const v = normalizeCtaValue(rawType, rawValue);
      if (!v.ok) errors.ctaValue = v.message;
      else {
        ctaType = rawType;
        ctaValue = v.value;
      }
    }
  } else if (rawValue !== "") {
    errors.ctaType = "Pilih jenis tujuan untuk nilai yang diisi.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title: (title as { value: string }).value,
      summary: (summary as { value: string }).value || null,
      description: (description as { value: string }).value || null,
      priceAmount: (price as { value: number | null }).value,
      priceLabel: (priceLabel as { value: string }).value || null,
      ctaType,
      ctaValue,
      // Label & template yang diketik pemilik disimpan apa adanya (tidak ditimpa default); kosong = null = default saat render.
      ctaLabel: (ctaLabel as { value: string }).value || null,
      ctaMessage: (ctaMessage as { value: string }).value || null,
    },
  };
}

/** Nilai database -> bidang formulir (untuk memuat editor). */
export function valueToFields(v: {
  title: unknown; summary: unknown; description: unknown; price_amount: unknown; price_label: unknown;
  cta_type: unknown; cta_value: unknown; cta_label: unknown; cta_message: unknown;
}): ItemFields {
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    title: s(v.title),
    summary: s(v.summary),
    description: s(v.description),
    priceAmount: typeof v.price_amount === "number" || typeof v.price_amount === "string" ? String(v.price_amount) : "",
    priceLabel: s(v.price_label),
    ctaType: isCtaType(v.cta_type) ? v.cta_type : "",
    ctaValue: s(v.cta_value),
    ctaLabel: s(v.cta_label),
    ctaMessage: s(v.cta_message),
  };
}

/** Nilai tervalidasi -> bidang formulir (menampilkan hasil normalisasi server kembali ke editor). */
export function itemValueToFields(v: ItemValue): ItemFields {
  return {
    title: v.title,
    summary: v.summary ?? "",
    description: v.description ?? "",
    priceAmount: v.priceAmount === null ? "" : String(v.priceAmount),
    priceLabel: v.priceLabel ?? "",
    ctaType: v.ctaType ?? "",
    ctaValue: v.ctaValue ?? "",
    ctaLabel: v.ctaLabel ?? "",
    ctaMessage: v.ctaMessage ?? "",
  };
}
