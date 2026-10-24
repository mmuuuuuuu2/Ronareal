// Snapshot publik -> data tampilan. Modul murni. Snapshot berasal dari database, tetapi TIDAK dipercaya begitu saja:
// semua field divalidasi/dibersihkan ulang sebelum dirender (URL link, path aset, pengaturan visual, panjang teks).
import { parseCatalogSnapshot } from "../catalog/view.ts";
import { LINK_ICON_KEYS, type LinkIconKey } from "../editor/icons.ts";
import { parseDraftConfig } from "../editor/settings.ts";
import { isUuid } from "../editor/upload.ts";
import type { PageViewData, PageViewLink } from "../editor/view-data.ts";
import { parseSeoFromConfig, resolveMeta, type ResolvedMeta } from "../seo/seo.ts";
import { safeHref } from "../validation/url.ts";

export const PUBLIC_BUCKET = "public-assets";
const MAX_LINKS = 50;
const PUBLIC_PATH = /^([0-9a-f-]{36})\/(avatar|background|link|catalog)\/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$/;

/** URL permanen objek di bucket PUBLIK. Menolak path yang tidak berpola baku (tidak ada traversal/skema lain). */
export function publicAssetUrl(supabaseUrl: string, path: unknown): string | null {
  if (typeof path !== "string") return null;
  const m = PUBLIC_PATH.exec(path);
  if (!m || !isUuid(m[1])) return null;
  let base: URL;
  try {
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  return `${base.origin}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}

export type PublicPage = {
  username: string;
  version: number | null;
  publishedAt: string | null;
  view: PageViewData;
  meta: ResolvedMeta;
};

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown, max: number): string => (typeof v === "string" ? Array.from(v.trim()).slice(0, max).join("") : "");

function iconOf(config: unknown): LinkIconKey | null {
  const i = obj(config).icon;
  return typeof i === "string" && (LINK_ICON_KEYS as readonly string[]).includes(i) ? (i as LinkIconKey) : null;
}

/** Mengubah payload get_public_page() menjadi data tampilan. Mengembalikan null bila payload tidak layak tampil. */
export function parsePublicSnapshot(raw: unknown, supabaseUrl: string): PublicPage | null {
  const root = obj(raw);
  const profile = obj(root.profile);
  const username = typeof profile.username === "string" ? profile.username.toLowerCase() : "";
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/.test(username)) return null;

  const displayName = text(profile.display_name, 80) || username;
  const bio = text(profile.bio, 500);
  const settings = parseDraftConfig(root.config);

  const links: PageViewLink[] = [];
  if (Array.isArray(root.links)) {
    for (const item of root.links.slice(0, MAX_LINKS)) {
      const l = obj(item);
      const title = text(l.title, 120);
      const url = safeHref(l.url); // skema berbahaya tidak pernah lolos ke halaman publik
      const id = typeof l.id === "string" ? l.id : "";
      if (!title || !url || !id) continue;
      links.push({
        id,
        title,
        url,
        description: text(l.description, 300),
        icon: iconOf(l.config),
        imageUrl: publicAssetUrl(supabaseUrl, l.image_path),
      });
    }
  }

  const avatarUrl = publicAssetUrl(supabaseUrl, profile.avatar_path);
  const backgroundUrl = publicAssetUrl(supabaseUrl, root.background_path);
  const version = typeof root.version === "number" && Number.isInteger(root.version) ? root.version : null;
  const publishedAt = typeof root.published_at === "string" ? root.published_at : null;

  const catalog = parseCatalogSnapshot(root.catalog, root.config, (path) => publicAssetUrl(supabaseUrl, path), {
    username,
    displayName,
  });

  return {
    username,
    version,
    publishedAt,
    view: { displayName, username, bio, avatarUrl, backgroundUrl, settings, links, catalog },
    meta: resolveMeta({ seo: parseSeoFromConfig(root.config), username, displayName, bio, avatarUrl, backgroundUrl }),
  };
}
