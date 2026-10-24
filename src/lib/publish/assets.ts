// Rencana sinkronisasi aset draft -> public-assets. Modul murni.
// Aturan: server HANYA menyalin path yang berasal dari baris database milik pengguna sesi (bukan dari client),
// path wajib berpola <uid>/<jenis>/<nama>.<ext> di folder pengguna, dan path publik = path draft (nama acak, immutable),
// sehingga salinan lama tidak pernah ditimpa dan URL publik aman untuk di-cache lama.
import { isOwnedCatalogPath } from "../catalog/images.ts";
import { isOwnedAssetPath, type AssetKind } from "../editor/upload.ts";

export type PublishAssetKind = AssetKind | "catalog";

export type CatalogAssetSource = {
  isVisible: boolean;
  images: { path: string; thumbPath: string | null; publishedPath: string | null; thumbPublishedPath: string | null }[];
};

export type AssetSources = {
  uid: string;
  avatar: { path: string | null; publishedPath: string | null };
  background: { path: string | null; publishedPath: string | null };
  links: { id: string; isVisible: boolean; path: string | null; publishedPath: string | null }[];
  /** Item katalog (Phase 5). Opsional: halaman tanpa katalog tidak mengirimnya. */
  catalog?: CatalogAssetSource[];
};

export type AssetCopy = { kind: PublishAssetKind; path: string };

export type AssetPlan =
  | {
      ok: true;
      /** Objek yang harus disalin (draft -> public) sebelum memanggil RPC publish. */
      copies: AssetCopy[];
      /** Argumen RPC publish_page_with_assets. */
      rpc: { p_avatar: string | null; p_background: string | null; p_links: Record<string, string> };
    }
  | { ok: false; message: string };

export function planAssetSync(src: AssetSources): AssetPlan {
  const copies: AssetCopy[] = [];
  const seen = new Set<string>();
  const need = (kind: PublishAssetKind, path: string, published: string | null) => {
    if (published !== path && !seen.has(path)) {
      seen.add(path);
      copies.push({ kind, path });
    }
  };

  let p_avatar: string | null = null;
  if (src.avatar.path !== null) {
    if (!isOwnedAssetPath(src.avatar.path, src.uid, "avatar")) return { ok: false, message: "Foto profil tidak valid. Unggah ulang foto profil." };
    p_avatar = src.avatar.path;
    need("avatar", p_avatar, src.avatar.publishedPath);
  }

  let p_background: string | null = null;
  if (src.background.path !== null) {
    if (!isOwnedAssetPath(src.background.path, src.uid, "background")) return { ok: false, message: "Gambar latar tidak valid. Unggah ulang gambar latar." };
    p_background = src.background.path;
    need("background", p_background, src.background.publishedPath);
  }

  const p_links: Record<string, string> = {};
  for (const l of src.links) {
    if (!l.isVisible || l.path === null) continue; // tautan tersembunyi tidak ikut terbit, gambarnya tidak disalin
    if (!isOwnedAssetPath(l.path, src.uid, "link")) return { ok: false, message: "Salah satu gambar tautan tidak valid. Unggah ulang gambar tersebut." };
    p_links[l.id] = l.path;
    need("link", l.path, l.publishedPath);
  }

  // Katalog: hanya item yang tampil; foto + thumbnail disalin bila belum punya salinan publik bernama sama.
  for (const item of src.catalog ?? []) {
    if (!item.isVisible) continue; // item nonaktif tidak terbit, fotonya tidak disalin
    for (const img of item.images) {
      if (!isOwnedCatalogPath(img.path, src.uid) || (img.thumbPath !== null && !isOwnedCatalogPath(img.thumbPath, src.uid))) {
        return { ok: false, message: "Salah satu foto katalog tidak valid. Hapus lalu unggah ulang foto tersebut." };
      }
      need("catalog", img.path, img.publishedPath);
      if (img.thumbPath !== null) need("catalog", img.thumbPath, img.thumbPublishedPath);
    }
  }

  return { ok: true, copies, rpc: { p_avatar, p_background, p_links } };
}
