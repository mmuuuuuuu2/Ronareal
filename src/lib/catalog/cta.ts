// CTA katalog — modul murni. Dipakai di client (umpan balik), server action (wajib), dan saat render halaman publik
// (pertahanan terakhir). Cermin constraint `catalog_items_cta_format` di database.
// Aturan: tujuan CTA yang kosong TIDAK menghasilkan tombol apa pun (tidak ada tujuan fiktif); hanya WhatsApp,
// URL https, email, dan telepon; skema berbahaya (javascript:, data:, vbscript:, ...) tidak pernah lolos.
import { validateLinkUrl } from "../validation/url.ts";

export const CTA_TYPES = ["whatsapp", "url", "email", "phone"] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const CTA_TYPE_LABELS: Record<CtaType, string> = {
  whatsapp: "WhatsApp",
  url: "Tautan (https)",
  email: "Email",
  phone: "Telepon",
};

/** Label bawaan per tujuan: hanya dipakai saat RENDER bila pemilik tidak mengisi label; tidak pernah ditulis ke database. */
export const DEFAULT_CTA_LABEL: Record<CtaType, string> = {
  whatsapp: "Tanya layanan ini",
  url: "Lihat detail",
  email: "Kirim email",
  phone: "Hubungi sekarang",
};

/** Saran cepat di editor (pemilik bebas mengetik sendiri). */
export const CTA_LABEL_SUGGESTIONS = ["Tanya layanan ini", "Konsultasi sekarang", "Lihat detail", "Pesan sekarang"] as const;

export const DEFAULT_WA_TEMPLATE =
  "Halo, saya tertarik mengenai {judul} di halaman {username}. Bisa minta informasi lebih lanjut?";

export const CTA_LABEL_MAX = 60;
export const CTA_MESSAGE_MAX = 1000;
export const CTA_VALUE_MAX = 2048;

export const isCtaType = (v: unknown): v is CtaType => typeof v === "string" && (CTA_TYPES as readonly string[]).includes(v);

export type CtaValueResult = { ok: true; value: string } | { ok: false; message: string };
const bad = (message: string): CtaValueResult => ({ ok: false, message });

/**
 * Nomor WhatsApp -> digit internasional tanpa "+" (format wa.me). Awalan 0 dianggap nomor Indonesia (0812… -> 62812…).
 * Awalan "+" atau "00" berarti sudah internasional. Nomor tanpa awalan tidak ditebak.
 */
export function normalizeWhatsapp(raw: string): string | null {
  let s = raw.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(s)) return null;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = `62${s.slice(1)}`;
  return /^[1-9][0-9]{7,14}$/.test(s) ? s : null;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const PHONE = /^\+?[0-9()-]{3,30}$/;

/** Memvalidasi dan menormalkan tujuan CTA sesuai jenisnya. Hasil lolos constraint database. */
export function normalizeCtaValue(type: CtaType, raw: unknown): CtaValueResult {
  if (typeof raw !== "string") return bad("Tujuan CTA wajib diisi.");
  const input = raw.trim();
  if (!input) return bad("Tujuan CTA wajib diisi.");
  if (input.length > CTA_VALUE_MAX) return bad("Tujuan CTA terlalu panjang.");

  if (type === "whatsapp") {
    const wa = normalizeWhatsapp(input);
    return wa ? { ok: true, value: wa } : bad("Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890.");
  }
  if (type === "url") {
    if (/^http:\/\//i.test(input)) return bad("Gunakan alamat https:// (http tidak diizinkan).");
    const v = validateLinkUrl(input);
    if (!v.ok) return bad(v.message);
    if (v.scheme !== "https") return bad("Hanya alamat https:// yang diizinkan.");
    return { ok: true, value: v.value };
  }
  if (type === "email") {
    if (input.length > 254 || !EMAIL.test(input)) return bad("Alamat email tidak valid.");
    return { ok: true, value: input };
  }
  const phone = input.replace(/\s/g, "");
  if (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 3) return bad("Nomor telepon tidak valid.");
  return { ok: true, value: phone };
}

// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp("[\\x00-\\x09\\x0B-\\x1F\\x7F]", "g");

/**
 * Mengisi placeholder {judul} {username} {nama}. Nilai berasal dari data tervalidasi; hasil dibersihkan dari karakter
 * kontrol dan dibatasi panjangnya. Template null/kosong = template bawaan. Placeholder tak dikenal dibiarkan apa adanya.
 */
export function renderMessageTemplate(
  template: string | null | undefined,
  vars: { judul: string; username: string; nama: string },
): string {
  const t = typeof template === "string" && template.trim() ? template : DEFAULT_WA_TEMPLATE;
  const filled = t.replace(/\{(judul|username|nama)\}/g, (_m, key: "judul" | "username" | "nama") => vars[key]);
  return Array.from(filled.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim()).slice(0, CTA_MESSAGE_MAX).join("");
}

export type CatalogCta = { label: string; href: string; external: boolean };

export type CtaSource = {
  type: unknown;
  value: unknown;
  label?: unknown;
  message?: unknown;
};
export type CtaContext = { title: string; username: string; displayName: string };

/** href CTA yang aman, atau null bila tujuan kosong/tidak valid. WhatsApp: hanya tautan; pengunjung yang menekan kirim. */
export function buildCtaHref(src: CtaSource, ctx: CtaContext): string | null {
  if (!isCtaType(src.type)) return null;
  const v = normalizeCtaValue(src.type, src.value); // divalidasi ULANG, apa pun asalnya
  if (!v.ok) return null;
  switch (src.type) {
    case "whatsapp": {
      const text = renderMessageTemplate(typeof src.message === "string" ? src.message : null, {
        judul: ctx.title, username: ctx.username, nama: ctx.displayName,
      });
      return `https://wa.me/${v.value}?text=${encodeURIComponent(text)}`;
    }
    case "url":
      return v.value;
    case "email":
      return `mailto:${v.value}?subject=${encodeURIComponent(Array.from(ctx.title).slice(0, 120).join(""))}`;
    case "phone":
      return `tel:${v.value}`;
  }
}

/** Tombol CTA siap render; null bila tidak ada tujuan valid (tombol tidak ditampilkan). */
export function resolveCta(src: CtaSource, ctx: CtaContext): CatalogCta | null {
  const href = buildCtaHref(src, ctx);
  if (!href || !isCtaType(src.type)) return null;
  const custom = typeof src.label === "string" ? Array.from(src.label.trim()).slice(0, CTA_LABEL_MAX).join("") : "";
  return { label: custom || DEFAULT_CTA_LABEL[src.type], href, external: src.type === "whatsapp" || src.type === "url" };
}
