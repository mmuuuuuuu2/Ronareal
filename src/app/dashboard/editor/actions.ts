"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import type {
  ActionResult, RemoveImageData, SaveDraftData, SaveLinkData, UploadData,
} from "@/lib/editor/action-types";
import { mapEditorError, mapUploadError } from "@/lib/editor/errors";
import { logServerError } from "@/lib/log";
import { DRAFT_BUCKET, signOne } from "@/lib/editor/load";
import { parseSaveResult, revFrom } from "@/lib/editor/draft-save";
import { sanitizeSettings } from "@/lib/editor/settings";
import {
  ASSET_KINDS, MAX_UPLOAD_BYTES, buildAssetPath, isOwnedAssetPath, isUuid, validateImageBytes, type AssetKind,
} from "@/lib/editor/upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateLink } from "@/lib/validation/link";
import { validateProfileInput } from "@/lib/validation/profile";

// Semua action: (1) identitas HANYA dari sesi server (getUser), tidak pernah dari input; (2) input divalidasi ulang;
// (3) akses data tetap dibatasi RLS; id link dari client hanya dipakai sebagai filter dan hasilnya selalu dicek
// (0 baris terpengaruh = bukan milik pengguna / tidak ada).

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const SIGNED_OUT = { ok: false, message: "Sesi Anda berakhir. Silakan masuk kembali.", signedOut: true } as const;
const NOT_FOUND = { ok: false, message: "Data tidak ditemukan atau bukan milik Anda." } as const;
const NO_PAGE = { ok: false, message: "Halaman Anda tidak ditemukan. Muat ulang halaman ini." } as const;

async function session() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

async function ownPage(supabase: Db, userId: string) {
  const { data, error } = await supabase.from("pages").select("id, draft_config").eq("owner_id", userId).maybeSingle();
  if (error || !data) return null;
  return data as { id: string; draft_config: unknown };
}

type Failure = { ok: false; message: string; fieldErrors?: Record<string, string>; retryable?: boolean; conflict?: boolean };

function fail(error: unknown, fallbackField?: string): Failure {
  const err =
    typeof error === "object" && error !== null
      ? (error as { message?: string; code?: string; status?: number })
      : { message: String(error) };
  logServerError("editor", error);
  const mapped = mapEditorError(err);
  const field = mapped.field ?? fallbackField;
  return {
    ok: false,
    message: mapped.message,
    retryable: mapped.retryable,
    ...(/draft_conflict/.test(err.message ?? "") ? { conflict: true } : {}),
    ...(field ? { fieldErrors: { [field]: mapped.message } } : {}),
  };
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/* ------------------------------------------------------------------ draft: profil + pengaturan */

// Satu RPC atomik (save_draft): hanya grup yang DIKIRIM yang ditulis, masing-masing dengan cek revisi. Aplikasi tidak lagi
// membaca draft_config lalu menulis ulang seluruhnya, jadi konfigurasi katalog (dan kunci lain) tidak pernah ikut tertimpa.
// Gagal/konflik => tidak ada yang tertulis (satu transaksi) dan published snapshot tidak tersentuh.
export async function saveDraftAction(input: unknown): Promise<ActionResult<SaveDraftData>> {
  const raw = asRecord(input);
  const revsRaw = asRecord(raw.revs);
  const revs = { profile: revFrom(revsRaw.profile), settings: revFrom(revsRaw.settings) };

  let profileValue: { displayName: string; bio: string; username: string } | null = null;
  if (raw.profile !== null && raw.profile !== undefined) {
    const rawProfile = asRecord(raw.profile);
    const profile = validateProfileInput({ displayName: rawProfile.displayName, bio: rawProfile.bio, username: rawProfile.username });
    if (!profile.ok) return { ok: false, message: "Periksa kembali isian yang ditandai.", fieldErrors: profile.errors };
    profileValue = profile.value;
  }
  const settingsValue = raw.settings === null || raw.settings === undefined ? null : sanitizeSettings(raw.settings);
  if (!profileValue && !settingsValue) return { ok: false, message: "Tidak ada perubahan untuk disimpan." };

  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { data, error } = await s.supabase.rpc("save_draft", {
      p_profile: profileValue,
      p_settings: settingsValue,
      p_profile_rev: revs.profile,
      p_settings_rev: revs.settings,
    });
    if (error) return fail(error, /username/.test(error.message ?? "") ? "username" : undefined);
    const parsed = parseSaveResult(data);
    if (!parsed) return { ok: false, message: "Respons server tidak dikenali. Muat ulang halaman untuk memastikan data tersimpan.", retryable: false };

    revalidatePath("/dashboard");
    return {
      ok: true,
      profile: profileValue ? { ...profileValue, username: parsed.username } : null,
      settings: settingsValue,
      revs: parsed.revs,
    };
  } catch (caught) {
    return fail(caught);
  }
}

/* ------------------------------------------------------------------ link */

export async function createLinkAction(input: unknown): Promise<ActionResult<SaveLinkData>> {
  const raw = asRecord(input);
  const v = validateLink({ title: raw.title, url: raw.url, description: raw.description, icon: raw.icon });
  if (!v.ok) return { ok: false, message: "Periksa kembali isian yang ditandai.", fieldErrors: v.errors };
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const page = await ownPage(s.supabase, s.user.id);
    if (!page) return NO_PAGE;
    // page_id berasal dari sesi server, bukan client. Posisi dipasang trigger database (selalu di akhir).
    const { data, error } = await s.supabase
      .from("page_links")
      .insert({
        page_id: page.id,
        title: v.value.title,
        url: v.value.url,
        description: v.value.description || null,
        config: v.value.icon ? { icon: v.value.icon } : {},
      })
      .select("id")
      .single();
    if (error) return fail(error);
    return { ok: true, id: String(data.id), fields: v.value };
  } catch (caught) {
    return fail(caught);
  }
}

export async function updateLinkAction(id: unknown, input: unknown): Promise<ActionResult<SaveLinkData>> {
  if (!isUuid(id)) return NOT_FOUND;
  const raw = asRecord(input);
  const v = validateLink({ title: raw.title, url: raw.url, description: raw.description, icon: raw.icon });
  if (!v.ok) return { ok: false, message: "Periksa kembali isian yang ditandai.", fieldErrors: v.errors };
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const cur = await s.supabase.from("page_links").select("config").eq("id", id).maybeSingle();
    if (cur.error) return fail(cur.error);
    if (!cur.data) return NOT_FOUND;
    const config = { ...asRecord(cur.data.config) };
    if (v.value.icon) config.icon = v.value.icon;
    else delete config.icon;
    const { data, error } = await s.supabase
      .from("page_links")
      .update({ title: v.value.title, url: v.value.url, description: v.value.description || null, config })
      .eq("id", id)
      .select("id");
    if (error) return fail(error);
    if (!data || data.length !== 1) return NOT_FOUND;
    return { ok: true, id, fields: v.value };
  } catch (caught) {
    return fail(caught);
  }
}

export async function toggleLinkAction(id: unknown, visible: unknown): Promise<ActionResult> {
  if (!isUuid(id) || typeof visible !== "boolean") return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { data, error } = await s.supabase.from("page_links").update({ is_visible: visible }).eq("id", id).select("id");
    if (error) return fail(error);
    if (!data || data.length !== 1) return NOT_FOUND;
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

export async function deleteLinkAction(id: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const cur = await s.supabase.from("page_links").select("image_path").eq("id", id).maybeSingle();
    if (cur.error) return fail(cur.error);
    if (!cur.data) return NOT_FOUND;
    const { data, error } = await s.supabase.from("page_links").delete().eq("id", id).select("id");
    if (error) return fail(error);
    if (!data || data.length !== 1) return NOT_FOUND;
    const old = cur.data.image_path;
    if (isOwnedAssetPath(old, s.user.id, "link")) await s.supabase.storage.from(DRAFT_BUCKET).remove([old]); // best effort
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

export async function reorderLinksAction(ids: unknown): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(isUuid)) {
    return { ok: false, message: "Urutan tautan tidak valid." };
  }
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.rpc("reorder_links", { p_ids: ids });
    if (error) return fail(error);
    return { ok: true };
  } catch (caught) {
    return fail(caught);
  }
}

/* ------------------------------------------------------------------ gambar */

function parseKind(v: unknown): AssetKind | null {
  return typeof v === "string" && (ASSET_KINDS as readonly string[]).includes(v) ? (v as AssetKind) : null;
}

/** Membaca path gambar saat ini + menyiapkan penulisan path baru, per jenis. RLS membatasi ke milik pengguna. */
async function imageTarget(supabase: Db, userId: string, kind: AssetKind, linkId: string | null) {
  if (kind === "link") {
    const cur = await supabase.from("page_links").select("image_path").eq("id", linkId as string).maybeSingle();
    if (cur.error) return { ok: false, error: fail(cur.error) } as const;
    if (!cur.data) return { ok: false, error: NOT_FOUND } as const;
    return {
      ok: true,
      old: (cur.data.image_path as string | null) ?? null,
      write: (path: string | null) => supabase.from("page_links").update({ image_path: path }).eq("id", linkId as string).select("id"),
    } as const;
  }
  if (kind === "avatar") {
    const cur = await supabase.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
    if (cur.error || !cur.data) return { ok: false, error: fail(cur.error ?? { message: "profile_missing" }) } as const;
    return {
      ok: true,
      old: (cur.data.avatar_path as string | null) ?? null,
      write: (path: string | null) => supabase.from("profiles").update({ avatar_path: path }).eq("id", userId).select("id"),
    } as const;
  }
  const cur = await supabase.from("pages").select("background_path").eq("owner_id", userId).maybeSingle();
  if (cur.error || !cur.data) return { ok: false, error: fail(cur.error ?? { message: "page_missing" }) } as const;
  return {
    ok: true,
    old: (cur.data.background_path as string | null) ?? null,
    write: (path: string | null) => supabase.from("pages").update({ background_path: path }).eq("owner_id", userId).select("id"),
  } as const;
}

export async function uploadImageAction(formData: FormData): Promise<ActionResult<UploadData>> {
  const kind = parseKind(formData.get("kind"));
  const linkRaw = formData.get("linkId");
  const file = formData.get("file");
  if (!kind) return { ok: false, message: "Jenis gambar tidak valid." };
  if (kind === "link" && !isUuid(linkRaw)) {
    return { ok: false, message: "Simpan tautan terlebih dahulu sebelum menambah gambar." };
  }
  if (!(file instanceof File)) return { ok: false, message: "File tidak ditemukan." };
  if (file.size <= 0) return { ok: false, message: "File kosong atau tidak terbaca." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Ukuran gambar maksimal 5 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateImageBytes(bytes, file.type); // isi file diperiksa (magic bytes), bukan hanya MIME klien
  if (!check.ok) return { ok: false, message: check.message };

  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { supabase, user } = s;

    const target = await imageTarget(supabase, user.id, kind, kind === "link" ? (linkRaw as string) : null);
    if (!target.ok) return target.error;

    // Nama acak: unggahan ulang tidak menimpa objek lama sebelum DB berhasil diperbarui.
    const path = buildAssetPath(user.id, kind, check.mime, randomUUID());
    const up = await supabase.storage.from(DRAFT_BUCKET).upload(path, bytes, {
      contentType: check.mime, upsert: false, cacheControl: "3600",
    });
    if (up.error) {
      const m = mapUploadError(up.error);
      return { ok: false, message: m.message, retryable: m.retryable };
    }

    const write = await target.write(path);
    if (write.error || !write.data || write.data.length !== 1) {
      await supabase.storage.from(DRAFT_BUCKET).remove([path]); // jangan tinggalkan objek yatim
      return write.error ? fail(write.error) : NOT_FOUND;
    }

    if (isOwnedAssetPath(target.old, user.id, kind)) await supabase.storage.from(DRAFT_BUCKET).remove([target.old]); // best effort
    const url = await signOne(supabase, user.id, path, kind);
    return { ok: true, path, url, kind };
  } catch (caught) {
    return fail(caught);
  }
}

export async function removeImageAction(kindRaw: unknown, linkId?: unknown): Promise<ActionResult<RemoveImageData>> {
  const kind = parseKind(kindRaw);
  if (!kind) return { ok: false, message: "Jenis gambar tidak valid." };
  if (kind === "link" && !isUuid(linkId)) return NOT_FOUND;
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { supabase, user } = s;
    const target = await imageTarget(supabase, user.id, kind, kind === "link" ? (linkId as string) : null);
    if (!target.ok) return target.error;
    const write = await target.write(null);
    if (write.error) return fail(write.error);
    if (!write.data || write.data.length !== 1) return NOT_FOUND;
    if (isOwnedAssetPath(target.old, user.id, kind)) await supabase.storage.from(DRAFT_BUCKET).remove([target.old]);
    return { ok: true, kind };
  } catch (caught) {
    return fail(caught);
  }
}
