// Metadata halaman publik (Phase 7) — modul murni. Hanya dari data TERBIT (PublicPage), tidak pernah dari draft.
// Canonical dan URL OG dibangun dari origin tepercaya (konfigurasi server), bukan header permintaan.
import type { Metadata } from "next";
import type { PublicPage } from "../publish/snapshot.ts";
import { buildPublicUrl, publicPath } from "../publish/state.ts";

export function buildPageMetadata(page: PublicPage, siteUrl: string | null): Metadata {
  const { meta, username } = page;
  const canonical = (siteUrl ? buildPublicUrl(siteUrl, username) : null) ?? publicPath(username);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: canonical,
      siteName: "RONA",
      ...(meta.imageUrl ? { images: [{ url: meta.imageUrl }] } : {}),
    },
    twitter: {
      card: meta.twitterCard,
      title: meta.ogTitle,
      description: meta.ogDescription,
      ...(meta.imageUrl ? { images: [meta.imageUrl] } : {}),
    },
    robots: { index: true, follow: true },
  };
}
