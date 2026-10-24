// SEO & berbagi sosial (Phase 7) — modul murni. Disimpan di pages.draft_config.seo dan ikut snapshot saat Publish.
// Batas HARUS sama dengan save_seo() di migration Phase 7 (dijaga tests/seo.test.ts). Database tetap otoritas.
import type { FieldErrors, Validated } from "../validation/auth.ts";

export const SEO_LIMITS = { title: 70, description: 160, ogTitle: 70, ogDescription: 200 } as const;
export const OG_IMAGE_SOURCES = ["avatar", "background", "none"] as const;
export const TWITTER_CARDS = ["summary", "summary_large_image"] as const;
export type OgImageSource = (typeof OG_IMAGE_SOURCES)[number];
export type TwitterCard = (typeof TWITTER_CARDS)[number];

export type SeoSettings = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: OgImageSource;
  twitterCard: TwitterCard;
};

export const DEFAULT_SEO: SeoSettings = {
  title: "", description: "", ogTitle: "", ogDescription: "", ogImage: "avatar", twitterCard: "summary",
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const len = (s: string) => Array.from(s).length;
const clip = (s: string, max: number) => Array.from(s).slice(0, max).join("");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Membaca data apa pun (mis. dari database/snapshot) menjadi SeoSettings. TOLERAN: tidak pernah melempar, tidak pernah "undefined"/"null". */
export function sanitizeSeo(raw: unknown): SeoSettings {
  const o = obj(raw);
  const bad = (s: string) => CONTROL.test(s);
  const text = (k: keyof typeof SEO_LIMITS) => {
    const v = clean(o[k]);
    return v && !bad(v) ? clip(v, SEO_LIMITS[k]) : "";
  };
  return {
    title: text("title"),
    description: text("description"),
    ogTitle: text("ogTitle"),
    ogDescription: text("ogDescription"),
    ogImage: pick(o.ogImage, OG_IMAGE_SOURCES, DEFAULT_SEO.ogImage),
    twitterCard: pick(o.twitterCard, TWITTER_CARDS, DEFAULT_SEO.twitterCard),
  };
}

/** SEO dari pages.draft_config / payload snapshot (`config`). */
export const parseSeoFromConfig = (config: unknown): SeoSettings => sanitizeSeo(obj(config).seo);

/** Validasi KETAT untuk input form (dipakai server action sebelum RPC). Galat per field, dalam bahasa Indonesia. */
export function validateSeo(raw: unknown): Validated<SeoSettings> {
  const o = obj(raw);
  const errors: FieldErrors = {};
  const names: Record<keyof typeof SEO_LIMITS, string> = {
    title: "Judul SEO", description: "Deskripsi meta", ogTitle: "Judul berbagi", ogDescription: "Deskripsi berbagi",
  };
  const value = { ...DEFAULT_SEO };
  for (const k of ["title", "description", "ogTitle", "ogDescription"] as const) {
    const v = clean(o[k]);
    if (CONTROL.test(v)) errors[k] = `${names[k]} mengandung karakter yang tidak diizinkan.`;
    else if (len(v) > SEO_LIMITS[k]) errors[k] = `${names[k]} maksimal ${SEO_LIMITS[k]} karakter.`;
    else value[k] = v;
  }
  if (typeof o.ogImage === "string" && !(OG_IMAGE_SOURCES as readonly string[]).includes(o.ogImage)) errors.ogImage = "Sumber gambar tidak dikenal.";
  else value.ogImage = pick(o.ogImage, OG_IMAGE_SOURCES, DEFAULT_SEO.ogImage);
  if (typeof o.twitterCard === "string" && !(TWITTER_CARDS as readonly string[]).includes(o.twitterCard)) errors.twitterCard = "Jenis kartu tidak dikenal.";
  else value.twitterCard = pick(o.twitterCard, TWITTER_CARDS, DEFAULT_SEO.twitterCard);
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export const sameSeo = (a: SeoSettings, b: SeoSettings) => (Object.keys(a) as (keyof SeoSettings)[]).every((k) => a[k] === b[k]);

export type ResolvedMeta = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  /** URL gambar berbagi dari aset TERBIT (avatar/latar), atau null. */
  imageUrl: string | null;
  twitterCard: TwitterCard;
};

/** Metadata akhir dengan default yang masuk akal. Tidak pernah menghasilkan string kosong/"undefined"/"null". */
export function resolveMeta(input: {
  seo: SeoSettings;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
}): ResolvedMeta {
  const name = clean(input.displayName) || input.username;
  const bio = clean(input.bio);
  const defaultTitle = `${name} (@${input.username})`;
  const defaultDescription = bio ? clip(bio, SEO_LIMITS.description) : `Halaman tautan ${name} di RONA.`;
  const title = input.seo.title || defaultTitle;
  const description = input.seo.description || defaultDescription;
  const imageUrl = input.seo.ogImage === "avatar" ? input.avatarUrl : input.seo.ogImage === "background" ? input.backgroundUrl : null;
  return {
    title,
    description,
    ogTitle: input.seo.ogTitle || title,
    ogDescription: input.seo.ogDescription || description,
    imageUrl,
    // Kartu besar tanpa gambar tampil rusak di platform sosial: turun ke "summary".
    twitterCard: input.seo.twitterCard === "summary_large_image" && !imageUrl ? "summary" : input.seo.twitterCard,
  };
}
