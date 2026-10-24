// Foto katalog — modul murni: path objek, batas, dan validasi unggahan di server. Pemrosesan canvas ada di komponen klien.
// Setiap foto punya DUA objek di bucket draft privat: versi penuh (maks 1600 px, untuk modal) dan thumbnail persegi
// (640 px, untuk grid). Pola path sama dengan Phase 1–4: <uid>/catalog/<nama-acak>.<ext>, sehingga policy storage,
// trigger database, dan salinan publish (path publik = path draft) tidak perlu mekanisme baru.
import { EXT_BY_MIME, isUuid, validateImageBytes, type AllowedMime } from "../editor/upload.ts";
import { MAX_PHOTOS_PER_ITEM } from "./item.ts";

export const FULL_MAX_PX = 1600;
export const THUMB_PX = 640;
export const THUMB_MAX_BYTES = 512 * 1024;
export const MAX_DIMENSION = 16384;

export type PhotoVariant = "full" | "thumb";

export function buildCatalogPath(uid: string, mime: AllowedMime, randomId: string, variant: PhotoVariant): string {
  if (!isUuid(uid)) throw new Error("uid tidak valid");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(randomId)) throw new Error("id acak tidak valid");
  return `${uid}/catalog/${randomId}${variant === "thumb" ? "-t" : ""}.${EXT_BY_MIME[mime]}`;
}

/** Path foto katalog milik uid? (dipakai sebelum menandatangani/menghapus/menyalin path dari data) */
export function isOwnedCatalogPath(path: unknown, uid: string): path is string {
  return (
    typeof path === "string" &&
    isUuid(uid) &&
    new RegExp(`^${uid}/catalog/[A-Za-z0-9._-]{1,80}\\.(jpg|jpeg|png|webp)$`).test(path)
  );
}

/** Ukuran keluaran: sisi terpanjang <= max, tanpa memperbesar gambar kecil. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(max > 0)) throw new Error("dimensi tidak valid");
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Berapa dari `picked` file yang masih muat pada item yang sudah punya `existing` foto. */
export function planPhotoBatch(existing: number, picked: number): { accept: number; rejected: number; full: boolean } {
  const room = Math.max(0, MAX_PHOTOS_PER_ITEM - Math.max(0, existing));
  const accept = Math.min(room, Math.max(0, picked));
  return { accept, rejected: Math.max(0, picked) - accept, full: room === 0 };
}

const clampDim = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_DIMENSION ? n : null;
};

export type CatalogUploadCheck =
  | { ok: true; fullMime: AllowedMime; thumbMime: AllowedMime | null; width: number | null; height: number | null }
  | { ok: false; message: string };

/**
 * Pemeriksaan server atas unggahan foto katalog: magic bytes + ukuran untuk file penuh dan thumbnail (SVG/HTML/file
 * berbahaya ditolak karena bukan JPG/PNG/WebP sungguhan). Dimensi dari client hanya metadata tampilan (dibatasi 1..16384).
 */
export function validateCatalogUpload(input: {
  full: Uint8Array;
  fullMime: unknown;
  thumb: Uint8Array | null;
  thumbMime: unknown;
  width: unknown;
  height: unknown;
}): CatalogUploadCheck {
  const full = validateImageBytes(input.full, input.fullMime);
  if (!full.ok) return { ok: false, message: full.message };
  let thumbMime: AllowedMime | null = null;
  if (input.thumb !== null) {
    const thumb = validateImageBytes(input.thumb, input.thumbMime);
    if (!thumb.ok) return { ok: false, message: `Thumbnail: ${thumb.message}` };
    if (input.thumb.length > THUMB_MAX_BYTES) return { ok: false, message: "Thumbnail terlalu besar." };
    thumbMime = thumb.mime;
  }
  return { ok: true, fullMime: full.mime, thumbMime, width: clampDim(input.width), height: clampDim(input.height) };
}
