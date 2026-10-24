"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult, PublishData } from "@/lib/editor/action-types";
import { mapEditorError } from "@/lib/editor/errors";
import { logServerError } from "@/lib/log";
import { DRAFT_BUCKET } from "@/lib/editor/load";
import { validateImageBytes } from "@/lib/editor/upload";
import { planAssetSync } from "@/lib/publish/assets";
import { validateItem, valueToFields } from "@/lib/catalog/item";
import { parseCatalogConfig } from "@/lib/catalog/view";
import { parsePublishState, publicPath } from "@/lib/publish/state";
import { validatePublishable } from "@/lib/publish/validate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Publish/unpublish. Identitas HANYA dari sesi server; action tidak menerima user id, username, atau path apa pun dari
// client — semua data diambil dari baris milik pengguna sesi (RLS), sehingga client tidak dapat menyuruh server menyalin
// file arbitrer. Urutan: validasi -> salin aset (draft privat -> public) -> RPC atomik -> invalidasi cache -> status.
// Status "berhasil" hanya dikembalikan setelah RPC publish benar-benar sukses.

const PUBLIC_BUCKET = "public-assets";
const SIGNED_OUT = { ok: false, message: "Sesi Anda berakhir. Silakan masuk kembali.", signedOut: true } as const;

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function failure(error: unknown): { ok: false; message: string; retryable?: boolean } {
  const err = typeof error === "object" && error !== null ? (error as { message?: string; status?: number }) : { message: String(error) };
  logServerError("publish", error);
  const m = mapEditorError(err);
  return { ok: false, message: m.message, retryable: m.retryable };
}

async function readState(supabase: Db) {
  const { data, error } = await supabase.rpc("get_publish_state");
  if (error) throw error;
  return parsePublishState(data);
}

export async function publishAction(): Promise<ActionResult<PublishData>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return SIGNED_OUT;

    // 1) Muat data milik pengguna (RLS memastikan hanya miliknya)
    const [profileRes, pageRes] = await Promise.all([
      supabase.from("profiles").select("username, display_name, avatar_path, avatar_published_path").eq("id", user.id).maybeSingle(),
      supabase.from("pages").select("id, draft_config, background_path, background_published_path").eq("owner_id", user.id).maybeSingle(),
    ]);
    if (profileRes.error || pageRes.error) return failure(profileRes.error ?? pageRes.error);
    const profile = profileRes.data;
    const page = pageRes.data;
    if (!profile || !page) return { ok: false, message: "Halaman Anda tidak ditemukan. Muat ulang halaman ini." };

    const linksRes = await supabase
      .from("page_links")
      .select("id, title, url, description, is_visible, image_path, image_published_path")
      .eq("page_id", page.id);
    if (linksRes.error) return failure(linksRes.error);
    const links = (linksRes.data ?? []) as {
      id: string; title: string; url: string; description: string | null; is_visible: boolean;
      image_path: string | null; image_published_path: string | null;
    }[];

    // Katalog (Phase 5): hanya jika section aktif; item tampil + fotonya. Dibaca dari DB milik sesi (RLS), bukan dari client.
    const catCfg = parseCatalogConfig(page.draft_config);
    let catalogSources: { isVisible: boolean; images: { path: string; thumbPath: string | null; publishedPath: string | null; thumbPublishedPath: string | null }[] }[] = [];
    const catalogProblems: string[] = [];
    if (catCfg.enabled) {
      const itemsRes = await supabase
        .from("catalog_items")
        .select("id, title, summary, description, price_amount, price_label, cta_type, cta_value, cta_label, cta_message")
        .eq("page_id", page.id)
        .eq("is_visible", true);
      if (itemsRes.error) return failure(itemsRes.error);
      const items = (itemsRes.data ?? []) as Record<string, unknown>[];
      items.forEach((it) => {
        const v = validateItem(valueToFields(it as Parameters<typeof valueToFields>[0]));
        if (!v.ok) catalogProblems.push(`Item katalog "${String(it.title ?? "").slice(0, 40)}" belum valid: ${Object.values(v.errors)[0] ?? "periksa isian"}`);
      });
      if (items.length > 0) {
        const imgRes = await supabase
          .from("catalog_images")
          .select("item_id, storage_path, thumb_path, published_path, thumb_published_path, position")
          .in("item_id", items.map((it) => String(it.id)))
          .order("position", { ascending: true });
        if (imgRes.error) return failure(imgRes.error);
        const byItem = new Map<string, { path: string; thumbPath: string | null; publishedPath: string | null; thumbPublishedPath: string | null }[]>();
        for (const r of (imgRes.data ?? []) as Record<string, string | null>[]) {
          const list = byItem.get(String(r.item_id)) ?? [];
          list.push({ path: String(r.storage_path), thumbPath: r.thumb_path ?? null, publishedPath: r.published_path ?? null, thumbPublishedPath: r.thumb_published_path ?? null });
          byItem.set(String(r.item_id), list);
        }
        catalogSources = items.map((it) => ({ isVisible: true, images: byItem.get(String(it.id)) ?? [] }));
      }
    }

    // 2) Validasi kelayakan terbit
    const check = validatePublishable({
      username: profile.username,
      displayName: profile.display_name ?? "",
      links: links.map((l) => ({ title: l.title, url: l.url, description: l.description ?? "", isVisible: l.is_visible })),
    });
    if (check.ok && catalogProblems.length > 0) {
      return { ok: false, message: catalogProblems[0] ?? "Katalog belum layak diterbitkan.", fieldErrors: { publish: catalogProblems.join("\n") } };
    }
    if (!check.ok) return { ok: false, message: check.problems[0] ?? "Halaman belum layak diterbitkan.", fieldErrors: { publish: check.problems.join("\n") } };

    // 3) Rencana aset (path hanya dari database, divalidasi kepemilikan/pola)
    const plan = planAssetSync({
      uid: user.id,
      avatar: { path: profile.avatar_path, publishedPath: profile.avatar_published_path },
      background: { path: page.background_path, publishedPath: page.background_published_path },
      links: links.map((l) => ({ id: l.id, isVisible: l.is_visible, path: l.image_path, publishedPath: l.image_published_path })),
      catalog: catalogSources,
    });
    if (!plan.ok) return { ok: false, message: plan.message };

    // 4) Salin hanya aset yang dibutuhkan. Bila ada yang gagal: berhenti SEBELUM menyentuh snapshot (live lama aman).
    for (const copy of plan.copies) {
      const down = await supabase.storage.from(DRAFT_BUCKET).download(copy.path);
      if (down.error || !down.data) {
        return { ok: false, message: "Salah satu gambar tidak dapat dibaca. Unggah ulang gambar tersebut lalu terbitkan lagi.", retryable: true };
      }
      const bytes = new Uint8Array(await down.data.arrayBuffer());
      const valid = validateImageBytes(bytes, undefined); // isi file diperiksa ulang sebelum menjadi publik
      if (!valid.ok) return { ok: false, message: `Gambar tidak valid: ${valid.message}` };
      const up = await supabase.storage.from(PUBLIC_BUCKET).upload(copy.path, bytes, {
        contentType: valid.mime, upsert: true, cacheControl: "31536000", // nama objek acak & immutable => aman di-cache lama
      });
      if (up.error) return { ok: false, message: "Gambar belum berhasil disalin ke penyimpanan publik. Coba terbitkan lagi.", retryable: true };
    }

    // 5) Transaksi atomik di database (juga memeriksa objek publik benar-benar ada)
    const { error } = await supabase.rpc("publish_page_with_assets", plan.rpc);
    if (error) return failure(error);

    // 6) Invalidasi cache halaman publik + dashboard, baru laporkan berhasil
    revalidatePath(publicPath(profile.username));
    revalidatePath("/dashboard");
    return { ok: true, state: await readState(supabase), username: profile.username };
  } catch (caught) {
    return failure(caught);
  }
}

export async function unpublishAction(): Promise<ActionResult<PublishData>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return SIGNED_OUT;
    const profile = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    if (profile.error || !profile.data) return failure(profile.error ?? { message: "profile_missing" });

    const { error } = await supabase.rpc("unpublish_page");
    if (error) return failure(error);

    revalidatePath(publicPath(profile.data.username)); // cache lama dibuang: halaman kini 404
    revalidatePath("/dashboard");
    return { ok: true, state: await readState(supabase), username: profile.data.username };
  } catch (caught) {
    return failure(caught);
  }
}
