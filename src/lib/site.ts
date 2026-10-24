import { resolveSiteUrl } from "./env.ts";

/** Origin situs yang tepercaya (lihat resolveSiteUrl). Dibaca saat dipanggil, hanya di server. */
export function getTrustedSiteUrl(): string | null {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);
}
