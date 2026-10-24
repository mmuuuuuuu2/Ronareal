// Data tampilan katalog — SATU bentuk untuk preview editor (draft, URL bertanda tangan) dan halaman publik (snapshot,
// URL bucket publik). Modul murni. Snapshot berasal dari database tetapi TIDAK dipercaya: semua field dibersihkan ulang,
// URL gambar hanya dari resolver yang diberikan pemanggil (path berpola baku), CTA dibangun ulang dan divalidasi.
import { resolveCta, type CatalogCta, type CtaContext } from "./cta.ts";
import {
  DEFAULT_SECTION_TITLE, LIMITS, MAX_ITEMS_PER_PAGE, MAX_PHOTOS_PER_ITEM, SECTION_TITLE_MAX, cleanText, formatPrice,
} from "./item.ts";
import { isUuid } from "../editor/upload.ts";

export type CatalogViewImage = { url: string; thumbUrl: string; width: number | null; height: number | null };

export type CatalogViewItem = {
  id: string;
  title: string;
  summary: string;
  description: string;
  price: string | null;
  images: CatalogViewImage[];
  coverIndex: number;
  cta: CatalogCta | null;
};

export type CatalogView = { title: string; items: CatalogViewItem[] };

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown, max: number, multiline = false): string => {
  const c = cleanText(typeof v === "string" ? Array.from(v).slice(0, max * 2).join("") : "", max * 2, "", multiline);
  return c.ok ? Array.from(c.value).slice(0, max).join("") : "";
};

/** pages.draft_config / snapshot.config -> {enabled, title}. Tanpa konfigurasi: aktif dengan judul "Layanan". */
export function parseCatalogConfig(config: unknown): { enabled: boolean; title: string } {
  const c = obj(obj(config).catalog);
  const title = text(c.title, SECTION_TITLE_MAX) || DEFAULT_SECTION_TITLE;
  return { enabled: typeof c.enabled === "boolean" ? c.enabled : true, title };
}

export type ViewItemInput = {
  id: string;
  title: string;
  summary: string;
  description: string;
  priceAmount: number | null;
  priceLabel: string | null;
  cta: { type: unknown; value: unknown; label: unknown; message: unknown };
  images: { url: string | null; thumbUrl: string | null; width?: number | null; height?: number | null }[];
  coverIndex: number;
};

/** Menyusun item tampilan; null bila judul kosong. Gambar tanpa URL dilewati. */
export function buildViewItem(i: ViewItemInput, ctx: Omit<CtaContext, "title">): CatalogViewItem | null {
  const title = text(i.title, LIMITS.title);
  if (!title) return null;
  const images: CatalogViewImage[] = [];
  let coverIndex = 0;
  i.images.slice(0, MAX_PHOTOS_PER_ITEM).forEach((img, idx) => {
    if (!img.url) return;
    if (idx === i.coverIndex) coverIndex = images.length;
    images.push({ url: img.url, thumbUrl: img.thumbUrl ?? img.url, width: img.width ?? null, height: img.height ?? null });
  });
  return {
    id: i.id,
    title,
    summary: text(i.summary, LIMITS.summary),
    description: text(i.description, LIMITS.description, true),
    price: formatPrice(i.priceAmount, i.priceLabel ? text(i.priceLabel, LIMITS.priceLabel) : null),
    images,
    coverIndex,
    cta: resolveCta({ type: i.cta.type, value: i.cta.value, label: i.cta.label, message: i.cta.message }, { ...ctx, title }),
  };
}

const dim = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 16384 ? v : null);

/**
 * Payload snapshot (root.catalog + root.config) -> CatalogView untuk halaman publik.
 * Mengembalikan null bila section dinonaktifkan atau tidak ada item layak tampil (tidak ada section kosong).
 */
export function parseCatalogSnapshot(
  rawCatalog: unknown,
  rawConfig: unknown,
  resolveUrl: (path: unknown) => string | null,
  ctx: Omit<CtaContext, "title">,
): CatalogView | null {
  const cfg = parseCatalogConfig(rawConfig);
  if (!cfg.enabled || !Array.isArray(rawCatalog)) return null;

  const items: CatalogViewItem[] = [];
  for (const raw of rawCatalog.slice(0, MAX_ITEMS_PER_PAGE)) {
    const o = obj(raw);
    if (!isUuid(o.id)) continue;
    const rawImages = Array.isArray(o.images) ? o.images.slice(0, MAX_PHOTOS_PER_ITEM) : [];
    const cover = resolveUrl(o.cover);
    const images = rawImages.map((im) => {
      const e = obj(im);
      return { url: resolveUrl(e.path), thumbUrl: resolveUrl(e.thumb), width: dim(e.w), height: dim(e.h) };
    });
    const coverIndex = Math.max(0, images.findIndex((im) => im.url !== null && im.url === cover));
    const price = typeof o.price_amount === "number" && Number.isSafeInteger(o.price_amount) ? o.price_amount : null;
    const item = buildViewItem(
      {
        id: o.id,
        title: String(o.title ?? ""),
        summary: String(o.summary ?? ""),
        description: String(o.description ?? ""),
        priceAmount: price,
        priceLabel: typeof o.price_label === "string" ? o.price_label : null,
        cta: { type: o.cta_type, value: o.cta_value, label: o.cta_label, message: o.cta_message },
        images,
        coverIndex,
      },
      ctx,
    );
    if (item) items.push(item);
  }
  return items.length > 0 ? { title: cfg.title, items } : null;
}
