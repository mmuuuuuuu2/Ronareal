"use server";

import { randomUUID } from "node:crypto";
import type {
  ActionResult, CatalogPhotoData, CatalogPhotosState, CatalogSettingsData, SaveCatalogItemData,
} from "@/lib/editor/action-types";
import { mapEditorError, mapUploadError } from "@/lib/editor/errors";
import { logServerError } from "@/lib/log";
import { DRAFT_BUCKET, signDraftPaths } from "@/lib/editor/load";
import { isUuid } from "@/lib/editor/upload";
import { buildCatalogPath, isOwnedCatalogPath, validateCatalogUpload } from "@/lib/catalog/images";
import { MAX_ITEMS_PER_PAGE, MAX_PHOTOS_PER_ITEM, itemValueToFields, validateItem, validateSectionTitle } from "@/lib/catalog/item";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Katalog (Phase 5). Semua action: (1) identitas HANYA dari sesi server; (2) input divalidasi ulang di server
// (validateItem/validateCatalogUpload) — validasi UI tidak dipercaya; (3) page_id selalu dari baris milik sesi, tidak
// pernah dari client; id item/foto dari client hanya filter, hasilnya dicek (0 baris = bukan milik pengguna);
// (4) database menegakkan RLS, batas 7 foto/30 item, pola path milik pemilik, dan format CTA. Perubahan di sini
// hanya menyentuh DRAFT: tidak ada yang berubah di halaman publik sampai pemilik menerbitkan (publish-actions.ts).

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const SIGNED_OUT = { ok: false, message: "Sesi Anda berakhir. Silakan masuk kembali.", signedOut: true } as const;
const NOT_FOUND = { ok: false, message: "Data tidak ditemukan atau bukan milik Anda." } as const;
const NO_PAGE = { ok: false, message: "Halaman Anda tidak ditemukan. Muat ulang halaman ini." } as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Failure = { ok: false; message: string; fieldErrors?: Record<string, string>; retryable?: boolean };

function fail(error: unknown, fallbackField?: string): Failure {
  const err = typeof error === "object" && error !== null ? (error as { message?: string; code?: string; status?: number }) : { message: String(error) };
  logServerError("catalog", error);
  const mapped = mapEditorError(err);
  const field = mapped.field ?? fallbackField;
  return { ok: false, message: mapped.message, retryable: mapped.retryable, ...(field ? { fieldErrors: { [field]: mapped.message } } : {}) };
}

async function session() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

async function ownPageId(supabase: Db, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("pages").select("id").eq("owner_id", userId).maybeSingle();
  return error || !data ? null : String(data.id);
}

function dbValues(v: ReturnType<typeof validateItem> & { ok: true }) {
  const x = v.value;
  return {
    title: x.title, summary: x.summary, description: x.description,
    price_amount: x.priceAmount, price_label: x.priceLabel,
    cta_type: x.ctaType, cta_value: x.ctaValue, cta_label: x.ctaLabel, cta_message: x.ctaMessage,
  };
}

/* ------------------------------------------------------------------ section */

export async function saveCatalogSettingsAction(input: unknown): Promise<ActionResult<CatalogSettingsData>> {
  const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  if (typeof o.enabled !== "boolean") return { ok: false, message: "Pengaturan tidak valid." };
  const title = validateSectionTitle(o.title);
  if (!title.ok) return { ok: false, message: title.message, fieldErrors: { title: title.message } };
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.rpc("set_catalog_settings", { p_enabled: o.enabled, p_title: title.value });
    if (error) return fail(error, "title");
    return { ok: true, enabled: o.enabled, title: title.value };
  } catch (caught) {
    return fail(caught);
  }
}

/* ------------------------------------------------------------------ item */

export async function createCatalogItemAction(input: unknown): Promise<ActionResult<SaveCatalogItemData>> {
  const v = validateItem(input);
  if (!v.ok) return { ok: false, message: "Periksa kembali isian yang ditandai.", fieldErrors: v.errors };
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const pageId = await ownPageId(s.supabase, s.user.id); // page_id dari sesi, bukan dari client
    if (!pageId) return NO_PAGE;
    // Posisi (di akhir), batas 30 item, dan sampul dipasang trigger database.
    const { data, error } = await s.supabase.from("catalog_items").insert({ page_id: pageId, ...dbValues(v) }).select("id").single();
    if (error) return fail(error);
    return { ok: true, id: String(data.id), fields: itemValueToFields(v.value) };
  } catch (caught) {
    return fail(caught);
  }
}

export async function updateCatalogItemAction(id: unknown, input: unknown): Promise<ActionResult<SaveCatalogItemData>> {
  if (!isUuid(id)) return NOT_FOUND;
  const v = validateItem(input);
  if (!v.ok) return { ok: false, message: "Periksa kembali isian yang ditandai.", fieldErrors: v.errors };
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    // Hanya kolom teks/harga/CTA. Foto TIDAK disentuh (tidak ada unggah ulang saat mengedit teks).
    const { data, error } = await s.supabase.from("catalog_items").update(dbValues(v)).eq("id", id).select("id");
    if (error) return fail(error);
    if (!data || data.length !== 1) return NOT_FOUND;
    return { ok: true, id, fields: itemValueToFields(v.value) };
  } catch (caught) {
    return fail(caught);
  }
}

export async function toggleCatalogItemAction(id: unknown, visible: unknown): Promise<ActionResult> {
  if (!isUuid(id) || typeof visible !== "boolean") return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { data, error } = await s.supabase.from("catalog_items").update({ is_visible: visible }).eq("id", id).select("id");
    if (error) return fail(error);
    if (!data || data.length !== 1) return NOT_FOUND;
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

export async function deleteCatalogItemAction(id: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const imgs = await s.supabase.from("catalog_images").select("storage_path, thumb_path").eq("item_id", id);
    if (imgs.error) return fail(imgs.error);
    const { data, error } = await s.supabase.from("catalog_items").delete().eq("id", id).select("id");
    if (error) return fail(error);
    if (!data || data.length !== 1) return NOT_FOUND;
    // Hanya objek DRAFT yang dibersihkan (best effort). Salinan publik TIDAK dihapus: snapshot live mungkin masih memakainya.
    const paths = ((imgs.data ?? []) as { storage_path: string | null; thumb_path: string | null }[]).flatMap((r) => [r.storage_path, r.thumb_path]).filter((p): p is string => isOwnedCatalogPath(p, s.user.id));
    if (paths.length > 0) await s.supabase.storage.from(DRAFT_BUCKET).remove(paths);
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

export async function reorderCatalogItemsAction(ids: unknown): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length > MAX_ITEMS_PER_PAGE || !ids.every(isUuid)) return { ok: false, message: "Urutan item tidak valid." };
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.rpc("reorder_catalog_items", { p_ids: ids });
    if (error) return fail(error);
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

/* ------------------------------------------------------------------ foto */

async function coverOf(supabase: Db, itemId: string): Promise<string | null> {
  const { data } = await supabase.from("catalog_items").select("cover_image_id").eq("id", itemId).maybeSingle();
  return (data?.cover_image_id as string | null | undefined) ?? null;
}

/**
 * Unggah SATU foto: berkas penuh (sudah dikecilkan di browser) + thumbnail persegi. Server memeriksa ulang isi file
 * (magic bytes; SVG/HTML ditolak), kepemilikan item, dan batas 7 foto. Nama objek acak: tidak menimpa apa pun.
 */
export async function uploadCatalogPhotoAction(formData: FormData): Promise<ActionResult<CatalogPhotoData>> {
  const itemId = formData.get("itemId");
  const full = formData.get("file");
  const thumb = formData.get("thumb");
  if (!isUuid(itemId)) return { ok: false, message: "Simpan item terlebih dahulu sebelum menambah foto." };
  if (!(full instanceof File) || full.size <= 0) return { ok: false, message: "File tidak ditemukan atau kosong." };
  if (full.size > MAX_FILE_BYTES) return { ok: false, message: "Ukuran gambar maksimal 5 MB." };
  if (thumb !== null && !(thumb instanceof File)) return { ok: false, message: "Thumbnail tidak valid." };

  const fullBytes = new Uint8Array(await full.arrayBuffer());
  const thumbBytes = thumb instanceof File && thumb.size > 0 ? new Uint8Array(await thumb.arrayBuffer()) : null;
  const check = validateCatalogUpload({
    full: fullBytes, fullMime: full.type,
    thumb: thumbBytes, thumbMime: thumb instanceof File ? thumb.type : null,
    width: formData.get("width"), height: formData.get("height"),
  });
  if (!check.ok) return { ok: false, message: check.message };

  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { supabase, user } = s;

    const item = await supabase.from("catalog_items").select("id").eq("id", itemId).maybeSingle(); // RLS: hanya milik sesi
    if (item.error) return fail(item.error);
    if (!item.data) return NOT_FOUND;
    const count = await supabase.from("catalog_images").select("id", { count: "exact", head: true }).eq("item_id", itemId);
    if (count.error) return fail(count.error);
    if ((count.count ?? 0) >= MAX_PHOTOS_PER_ITEM) return { ok: false, message: "Satu item maksimal 7 foto." };

    const rand = randomUUID();
    const fullPath = buildCatalogPath(user.id, check.fullMime, rand, "full");
    const thumbPath = check.thumbMime ? buildCatalogPath(user.id, check.thumbMime, rand, "thumb") : null;

    const upFull = await supabase.storage.from(DRAFT_BUCKET).upload(fullPath, fullBytes, { contentType: check.fullMime, upsert: false, cacheControl: "3600" });
    if (upFull.error) {
      const m = mapUploadError(upFull.error);
      return { ok: false, message: m.message, retryable: m.retryable };
    }
    if (thumbPath && thumbBytes && check.thumbMime) {
      const upThumb = await supabase.storage.from(DRAFT_BUCKET).upload(thumbPath, thumbBytes, { contentType: check.thumbMime, upsert: false, cacheControl: "3600" });
      if (upThumb.error) {
        await supabase.storage.from(DRAFT_BUCKET).remove([fullPath]);
        const m = mapUploadError(upThumb.error);
        return { ok: false, message: m.message, retryable: m.retryable };
      }
    }

    const ins = await supabase
      .from("catalog_images")
      .insert({ item_id: itemId, storage_path: fullPath, thumb_path: thumbPath, width: check.width, height: check.height, size_bytes: fullBytes.length, mime: check.fullMime })
      .select("id")
      .single();
    if (ins.error) {
      await supabase.storage.from(DRAFT_BUCKET).remove([fullPath, ...(thumbPath ? [thumbPath] : [])]); // jangan tinggalkan objek yatim
      return fail(ins.error);
    }

    const [urlFull, urlThumb] = await signDraftPaths(supabase, user.id, [
      { path: fullPath, kind: "catalog" }, { path: thumbPath, kind: "catalog" },
    ]);
    return {
      ok: true,
      photo: {
        id: String(ins.data.id), path: fullPath, thumbPath, url: urlFull ?? null, thumbUrl: urlThumb ?? urlFull ?? null,
        width: check.width, height: check.height,
      },
      coverId: await coverOf(supabase, itemId),
    };
  } catch (caught) {
    return fail(caught);
  }
}

export async function deleteCatalogPhotoAction(itemId: unknown, imageId: unknown): Promise<ActionResult<CatalogPhotosState>> {
  if (!isUuid(itemId) || !isUuid(imageId)) return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { supabase, user } = s;
    const cur = await supabase.from("catalog_images").select("storage_path, thumb_path").eq("id", imageId).eq("item_id", itemId).maybeSingle();
    if (cur.error) return fail(cur.error);
    if (!cur.data) return NOT_FOUND;
    const del = await supabase.from("catalog_images").delete().eq("id", imageId).eq("item_id", itemId).select("id");
    if (del.error) return fail(del.error);
    if (!del.data || del.data.length !== 1) return NOT_FOUND;
    // Objek DRAFT dibersihkan; salinan publik (bila ada) dibiarkan karena snapshot live mungkin masih memakainya.
    const paths = [cur.data.storage_path, cur.data.thumb_path].filter((p): p is string => isOwnedCatalogPath(p, user.id));
    if (paths.length > 0) await supabase.storage.from(DRAFT_BUCKET).remove(paths);
    const rest = await supabase.from("catalog_images").select("id").eq("item_id", itemId).order("position", { ascending: true });
    return { ok: true, coverId: await coverOf(supabase, itemId), order: ((rest.data ?? []) as { id: string }[]).map((r) => String(r.id)) };
  } catch (caught) {
    return fail(caught);
  }
}

export async function reorderCatalogPhotosAction(itemId: unknown, ids: unknown): Promise<ActionResult> {
  if (!isUuid(itemId) || !Array.isArray(ids) || ids.length > MAX_PHOTOS_PER_ITEM || !ids.every(isUuid)) {
    return { ok: false, message: "Urutan foto tidak valid." };
  }
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.rpc("reorder_catalog_images", { p_item: itemId, p_ids: ids });
    if (error) return fail(error);
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

export async function setCatalogCoverAction(itemId: unknown, imageId: unknown): Promise<ActionResult> {
  if (!isUuid(itemId) || !isUuid(imageId)) return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.rpc("set_catalog_cover", { p_item: itemId, p_image: imageId });
    if (error) return fail(error);
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}
