// Validasi & matematika unggah gambar — modul murni (tanpa DOM) agar bisa diuji. Pemotongan/kompresi
// yang memakai canvas ada di komponen klien; server memvalidasi ULANG MIME, ukuran, dan magic bytes.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // sama dengan batas bucket
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];
export type AssetKind = "avatar" | "background" | "link";
export const ASSET_KINDS: readonly AssetKind[] = ["avatar", "background", "link"];

export const EXT_BY_MIME: Record<AllowedMime, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Ukuran keluaran setelah crop (px) dan rasio target per jenis. Latar 9:16 = potret layar ponsel. */
export const OUTPUT_SPEC: Record<AssetKind, { aspect: number; width: number; height: number }> = {
  avatar: { aspect: 1, width: 512, height: 512 },
  background: { aspect: 9 / 16, width: 1080, height: 1920 },
  link: { aspect: 4 / 3, width: 800, height: 600 },
};

export type FileCheck = { ok: true; mime: AllowedMime } | { ok: false; message: string };

/** Pemeriksaan awal pada metadata file dari klien (UX). Server tetap memeriksa isi file. */
export function checkImageMeta(file: { type: unknown; size: unknown }): FileCheck {
  if (typeof file.size !== "number" || !Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: "File kosong atau tidak terbaca." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Ukuran gambar maksimal 5 MB." };
  }
  if (typeof file.type !== "string" || !(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Format gambar harus JPG, PNG, atau WebP (SVG tidak didukung)." };
  }
  return { ok: true, mime: file.type as AllowedMime };
}

/** Mendeteksi tipe gambar sebenarnya dari byte awal file (tidak percaya pada MIME/ekstensi dari klien). */
export function sniffImageType(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50   // WEBP
  ) return "image/webp";
  return null;
}

/** Pemeriksaan server: ukuran, MIME terklaim harus cocok dengan isi sebenarnya. */
export function validateImageBytes(bytes: Uint8Array, claimedMime: unknown): FileCheck {
  if (bytes.length === 0) return { ok: false, message: "File kosong atau tidak terbaca." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, message: "Ukuran gambar maksimal 5 MB." };
  const real = sniffImageType(bytes);
  if (!real) return { ok: false, message: "File bukan gambar JPG, PNG, atau WebP yang valid." };
  if (typeof claimedMime === "string" && claimedMime !== real) {
    return { ok: false, message: "Jenis file tidak sesuai dengan isinya." };
  }
  return { ok: true, mime: real };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Path objek: <uid>/<jenis>/<nama-acak>.<ext>. Cocok dengan policy storage & trigger database. */
export function buildAssetPath(uid: string, kind: AssetKind, mime: AllowedMime, randomId: string): string {
  if (!isUuid(uid)) throw new Error("uid tidak valid");
  if (!ASSET_KINDS.includes(kind)) throw new Error("jenis aset tidak valid");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(randomId)) throw new Error("id acak tidak valid");
  return `${uid}/${kind}/${randomId}.${EXT_BY_MIME[mime]}`;
}

/** Path milik uid dan jenis tertentu? (dipakai sebelum menghapus/menandatangani path dari data) */
export function isOwnedAssetPath(path: unknown, uid: string, kind: AssetKind): path is string {
  return (
    typeof path === "string" &&
    isUuid(uid) &&
    new RegExp(`^${uid}/${kind}/[A-Za-z0-9._-]{1,80}\\.(jpg|jpeg|png|webp)$`).test(path)
  );
}

export type CropRect = { sx: number; sy: number; sw: number; sh: number };

/**
 * Menghitung area sumber untuk crop "cover" pada rasio target.
 * zoom >= 1 memperkecil area; fx/fy (0–1) menentukan titik fokus. Hasil selalu berada di dalam gambar.
 */
export function computeCrop(
  srcW: number,
  srcH: number,
  aspect: number,
  zoom = 1,
  fx = 0.5,
  fy = 0.5,
): CropRect {
  if (!(srcW > 0) || !(srcH > 0) || !(aspect > 0)) throw new Error("dimensi tidak valid");
  const z = Math.min(4, Math.max(1, Number.isFinite(zoom) ? zoom : 1));
  const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
  let sw = srcW;
  let sh = srcW / aspect;
  if (sh > srcH) {
    sh = srcH;
    sw = srcH * aspect;
  }
  sw /= z;
  sh /= z;
  const sx = (srcW - sw) * clamp01(fx);
  const sy = (srcH - sh) * clamp01(fy);
  return { sx, sy, sw, sh };
}
