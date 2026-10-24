import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LINK_ICON_KEYS, type LinkIconKey } from "./icons.ts";
import { revFrom, type DraftRevs } from "./draft-save.ts";
import { parseDraftConfig, type PageSettings } from "./settings.ts";
import type { EditorLink, ProfileDraft } from "./state.ts";
import { isOwnedAssetPath } from "./upload.ts";
import { isOwnedCatalogPath } from "../catalog/images.ts";
import { valueToFields } from "../catalog/item.ts";
import { parseCatalogConfig } from "../catalog/view.ts";
import type { EditorCatalogItem, EditorPhoto } from "../catalog/state.ts";
import { parsePublishState, type PublishState } from "../publish/state.ts";

export const DRAFT_BUCKET = "draft-assets";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type EditorInitialData = {
  profile: ProfileDraft;
  settings: PageSettings;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  links: EditorLink[];
  revs: DraftRevs;
  catalog: { enabled: boolean; title: string; items: EditorCatalogItem[] };
  isPublished: boolean;
  publishState: PublishState;
};

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** URL bertanda tangan berumur pendek untuk menampilkan gambar draft dari bucket PRIVAT (bucket tidak pernah dibuka). */
export async function signDraftPaths(
  supabase: SupabaseServer,
  userId: string,
  entries: { path: string | null; kind: "avatar" | "background" | "link" | "catalog" }[],
): Promise<(string | null)[]> {
  const valid = entries.map((e) => {
    if (!e.path) return null;
    const owned = e.kind === "catalog" ? isOwnedCatalogPath(e.path, userId) : isOwnedAssetPath(e.path, userId, e.kind);
    return owned ? e.path : null;
  });
  const paths = valid.filter((p): p is string => p !== null);
  if (paths.length === 0) return entries.map(() => null);
  const { data, error } = await supabase.storage.from(DRAFT_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return entries.map(() => null); // gambar gagal ditandatangani tidak boleh menggagalkan editor
  const byPath = new Map<string, string>();
  for (const row of data) if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
  return valid.map((p) => (p ? (byPath.get(p) ?? null) : null));
}

export async function signOne(
  supabase: SupabaseServer,
  userId: string,
  path: string,
  kind: "avatar" | "background" | "link",
): Promise<string | null> {
  const [url] = await signDraftPaths(supabase, userId, [{ path, kind }]);
  return url ?? null;
}

function iconFrom(config: unknown): LinkIconKey | null {
  if (typeof config !== "object" || config === null) return null;
  const icon = (config as Record<string, unknown>).icon;
  return typeof icon === "string" && (LINK_ICON_KEYS as readonly string[]).includes(icon) ? (icon as LinkIconKey) : null;
}

/** Memuat semua data editor milik pengguna (RLS memastikan hanya miliknya). Melempar bila query gagal. */
export async function loadEditorData(userId: string): Promise<EditorInitialData | null> {
  const supabase = await createSupabaseServerClient();
  const [profileRes, pageRes, stateRes] = await Promise.all([
    supabase.from("profiles").select("username, display_name, bio, avatar_path, profile_rev").eq("id", userId).maybeSingle(),
    supabase.from("pages").select("id, draft_config, background_path, is_published, settings_rev").eq("owner_id", userId).maybeSingle(),
    supabase.rpc("get_publish_state"),
  ]);
  if (profileRes.error || pageRes.error || stateRes.error) throw new Error("Data editor tidak dapat dimuat.");
  const profile = profileRes.data;
  const page = pageRes.data;
  if (!profile || !page) return null;

  const linksRes = await supabase
    .from("page_links")
    .select("id, title, url, description, config, is_visible, image_path, position")
    .eq("page_id", page.id)
    .order("position", { ascending: true });
  if (linksRes.error) throw new Error("Daftar tautan tidak dapat dimuat.");
  const rows = linksRes.data ?? [];

  const signed = await signDraftPaths(supabase, userId, [
    { path: profile.avatar_path ?? null, kind: "avatar" },
    { path: page.background_path ?? null, kind: "background" },
    ...rows.map((r: Record<string, unknown>) => ({ path: (r.image_path as string | null) ?? null, kind: "link" as const })),
  ]);

  const links: EditorLink[] = rows.map((r: Record<string, unknown>, i: number) => {
    const fields = {
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      description: String(r.description ?? ""),
      icon: iconFrom(r.config),
    };
    return {
      id: String(r.id),
      ...fields,
      isVisible: r.is_visible !== false,
      imagePath: (r.image_path as string | null) ?? null,
      imageUrl: signed[2 + i] ?? null,
      saved: { ...fields },
      status: "idle",
    };
  });

  const catalog = await loadCatalog(supabase, userId, page.id, page.draft_config);

  return {
    profile: { displayName: profile.display_name ?? "", bio: profile.bio ?? "", username: profile.username },
    settings: parseDraftConfig(page.draft_config),
    avatarUrl: signed[0] ?? null,
    backgroundUrl: signed[1] ?? null,
    links,
    revs: { profile: revFrom(profile.profile_rev), settings: revFrom(page.settings_rev) },
    catalog,
    isPublished: page.is_published === true,
    publishState: parsePublishState(stateRes.data),
  };
}

/** Katalog draft milik pengguna: 2 query (item, foto) + satu panggilan penandatanganan URL untuk semua foto. */
async function loadCatalog(supabase: SupabaseServer, userId: string, pageId: string, draftConfig: unknown) {
  const cfg = parseCatalogConfig(draftConfig);
  const itemsRes = await supabase
    .from("catalog_items")
    .select("id, title, summary, description, price_amount, price_label, cta_type, cta_value, cta_label, cta_message, is_visible, cover_image_id, position")
    .eq("page_id", pageId)
    .order("position", { ascending: true });
  if (itemsRes.error) throw new Error("Katalog tidak dapat dimuat.");
  const rows = (itemsRes.data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { enabled: cfg.enabled, title: cfg.title, items: [] as EditorCatalogItem[] };

  const imgRes = await supabase
    .from("catalog_images")
    .select("id, item_id, position, storage_path, thumb_path, width, height")
    .in("item_id", rows.map((r) => String(r.id)))
    .order("position", { ascending: true });
  if (imgRes.error) throw new Error("Foto katalog tidak dapat dimuat.");
  const imgs = (imgRes.data ?? []) as Record<string, unknown>[];

  // Satu panggilan untuk semua path (foto penuh + thumbnail). URL berumur 1 jam; bucket tetap privat.
  const sign = await signDraftPaths(supabase, userId, imgs.flatMap((r) => [
    { path: (r.storage_path as string | null) ?? null, kind: "catalog" as const },
    { path: (r.thumb_path as string | null) ?? null, kind: "catalog" as const },
  ]));

  const photosByItem = new Map<string, EditorPhoto[]>();
  imgs.forEach((r, idx) => {
    const photo: EditorPhoto = {
      id: String(r.id),
      path: String(r.storage_path),
      thumbPath: (r.thumb_path as string | null) ?? null,
      url: sign[idx * 2] ?? null,
      thumbUrl: sign[idx * 2 + 1] ?? sign[idx * 2] ?? null,
      width: typeof r.width === "number" ? r.width : null,
      height: typeof r.height === "number" ? r.height : null,
    };
    const list = photosByItem.get(String(r.item_id)) ?? [];
    list.push(photo);
    photosByItem.set(String(r.item_id), list);
  });

  const items: EditorCatalogItem[] = rows.map((r) => {
    const fields = valueToFields(r as Parameters<typeof valueToFields>[0]);
    return {
      id: String(r.id),
      fields,
      saved: { ...fields },
      isVisible: r.is_visible !== false,
      photos: photosByItem.get(String(r.id)) ?? [],
      coverId: (r.cover_image_id as string | null) ?? null,
      status: "idle",
    };
  });
  return { enabled: cfg.enabled, title: cfg.title, items };
}
