// State editor katalog — reducer murni (tanpa React/DOM). Ketikan hanya mengubah state lokal; server baru dihubungi saat
// pemilik menekan simpan / mengunggah foto (tidak ada request per ketukan). Preview dibangun dari state ini (draft).
import { moveItem } from "../editor/state.ts";
import { DEFAULT_SECTION_TITLE, EMPTY_ITEM_FIELDS, MAX_ITEMS_PER_PAGE, MAX_PHOTOS_PER_ITEM, parsePrice, validateItem, type ItemFields } from "./item.ts";
import { buildViewItem, type CatalogView } from "./view.ts";

export type EditorPhoto = {
  id: string;
  path: string;
  thumbPath: string | null;
  url: string | null; // URL bertanda tangan sementara dari bucket PRIVAT (hanya untuk tampilan editor)
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
};

export type EditorCatalogItem = {
  id: string; // id database; item baru memakai "new:<n>" sampai tersimpan
  fields: ItemFields;
  saved: ItemFields | null; // null = belum pernah disimpan
  isVisible: boolean;
  photos: EditorPhoto[];
  coverId: string | null;
  status: "idle" | "saving" | "error";
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type CatalogEditorState = {
  enabled: boolean;
  title: string;
  savedEnabled: boolean;
  savedTitle: string;
  settingsStatus: "idle" | "saving" | "error";
  settingsError?: string;
  items: EditorCatalogItem[];
  nextTempId: number;
};

export type CatalogAction =
  | { type: "settings/set"; patch: Partial<{ enabled: boolean; title: string }> }
  | { type: "settings/saving" }
  | { type: "settings/saved"; enabled: boolean; title: string }
  | { type: "settings/failed"; message: string }
  | { type: "item/add" }
  | { type: "item/edit"; id: string; patch: Partial<ItemFields> }
  | { type: "item/saving"; id: string }
  | { type: "item/saved"; id: string; newId: string; fields: ItemFields }
  | { type: "item/failed"; id: string; message: string; fieldErrors?: Record<string, string> }
  | { type: "item/discard"; id: string }
  | { type: "item/remove"; id: string }
  | { type: "item/visible"; id: string; value: boolean }
  | { type: "item/photos"; id: string; photos: EditorPhoto[]; coverId: string | null }
  | { type: "item/photoAdd"; id: string; photo: EditorPhoto; coverId: string | null }
  | { type: "items/replace"; items: EditorCatalogItem[] }
  | { type: "items/move"; id: string; direction: -1 | 1 };

export const isNewItem = (i: EditorCatalogItem) => i.id.startsWith("new:");

const sameFields = (a: ItemFields, b: ItemFields) =>
  (Object.keys(a) as (keyof ItemFields)[]).every((k) => a[k] === b[k]);

export function isItemDirty(i: EditorCatalogItem): boolean {
  return isNewItem(i) || i.saved === null || !sameFields(i.fields, i.saved);
}

export function isSettingsDirty(s: CatalogEditorState): boolean {
  return s.enabled !== s.savedEnabled || s.title.trim() !== s.savedTitle.trim();
}

export function isCatalogDirty(s: CatalogEditorState): boolean {
  return isSettingsDirty(s) || s.items.some(isItemDirty);
}

export function canAddItem(s: CatalogEditorState): boolean {
  return s.items.length < MAX_ITEMS_PER_PAGE;
}

export function canAddPhoto(i: EditorCatalogItem): boolean {
  return !isNewItem(i) && i.photos.length < MAX_PHOTOS_PER_ITEM;
}

export function initialCatalogState(input: { enabled: boolean; title: string; items: EditorCatalogItem[] }): CatalogEditorState {
  const title = input.title || DEFAULT_SECTION_TITLE;
  return {
    enabled: input.enabled, title, savedEnabled: input.enabled, savedTitle: title,
    settingsStatus: "idle", items: input.items, nextTempId: 1,
  };
}

const update = (s: CatalogEditorState, id: string, fn: (i: EditorCatalogItem) => EditorCatalogItem): CatalogEditorState => ({
  ...s,
  items: s.items.map((i) => (i.id === id ? fn(i) : i)),
});

export function catalogReducer(s: CatalogEditorState, a: CatalogAction): CatalogEditorState {
  switch (a.type) {
    case "settings/set":
      return { ...s, ...a.patch, settingsStatus: "idle", settingsError: undefined };
    case "settings/saving":
      return { ...s, settingsStatus: "saving", settingsError: undefined };
    case "settings/saved":
      return { ...s, enabled: a.enabled, title: a.title, savedEnabled: a.enabled, savedTitle: a.title, settingsStatus: "idle", settingsError: undefined };
    case "settings/failed":
      return { ...s, settingsStatus: "error", settingsError: a.message };
    case "item/add": {
      if (!canAddItem(s)) return s;
      const id = `new:${s.nextTempId}`;
      const item: EditorCatalogItem = {
        id, fields: { ...EMPTY_ITEM_FIELDS }, saved: null, isVisible: true, photos: [], coverId: null, status: "idle",
      };
      return { ...s, items: [...s.items, item], nextTempId: s.nextTempId + 1 };
    }
    case "item/edit":
      return update(s, a.id, (i) => ({ ...i, fields: { ...i.fields, ...a.patch }, status: i.status === "error" ? "idle" : i.status, error: undefined, fieldErrors: undefined }));
    case "item/saving":
      return update(s, a.id, (i) => ({ ...i, status: "saving", error: undefined, fieldErrors: undefined }));
    case "item/saved":
      // fields (yang sedang diketik) tidak ditimpa; hanya snapshot "tersimpan" yang diperbarui.
      return update(s, a.id, (i) => ({ ...i, id: a.newId, saved: { ...a.fields }, status: "idle", error: undefined, fieldErrors: undefined }));
    case "item/failed":
      return update(s, a.id, (i) => ({ ...i, status: "error", error: a.message, fieldErrors: a.fieldErrors }));
    case "item/discard":
      if (s.items.find((i) => i.id === a.id && isNewItem(i))) return { ...s, items: s.items.filter((i) => i.id !== a.id) };
      return update(s, a.id, (i) => (i.saved ? { ...i, fields: { ...i.saved }, status: "idle", error: undefined, fieldErrors: undefined } : i));
    case "item/remove":
      return { ...s, items: s.items.filter((i) => i.id !== a.id) };
    case "item/visible":
      return update(s, a.id, (i) => ({ ...i, isVisible: a.value }));
    case "item/photos":
      return update(s, a.id, (i) => ({ ...i, photos: a.photos.slice(0, MAX_PHOTOS_PER_ITEM), coverId: a.coverId }));
    case "item/photoAdd":
      return update(s, a.id, (i) =>
        i.photos.some((p) => p.id === a.photo.id) || i.photos.length >= MAX_PHOTOS_PER_ITEM
          ? i
          : { ...i, photos: [...i.photos, a.photo], coverId: a.coverId ?? i.coverId },
      );
    case "items/replace":
      return { ...s, items: a.items };
    case "items/move": {
      const from = s.items.findIndex((i) => i.id === a.id);
      const to = from + a.direction;
      if (from < 0 || to < 0 || to >= s.items.length) return s;
      return { ...s, items: moveItem(s.items, from, to) };
    }
  }
}

/** Preview draft: item tampil dengan judul terisi; teks sesuai ketikan terakhir (bukan hanya yang tersimpan). */
export function toCatalogPreview(s: CatalogEditorState, ctx: { username: string; displayName: string }): CatalogView | null {
  if (!s.enabled) return null;
  const items = [];
  for (const i of s.items) {
    if (!i.isVisible) continue;
    // Validasi lunak: bila CTA/harga belum valid, preview tetap tampil tanpa bagian yang belum valid.
    const v = validateItem(i.fields);
    const f = i.fields;
    const price = parsePrice(f.priceAmount);
    const coverIndex = Math.max(0, i.photos.findIndex((p) => p.id === i.coverId));
    const view = buildViewItem(
      {
        id: i.id,
        title: f.title,
        summary: f.summary,
        description: f.description,
        priceAmount: price.ok ? price.value : null,
        priceLabel: f.priceLabel || null,
        cta: v.ok
          ? { type: v.value.ctaType, value: v.value.ctaValue, label: v.value.ctaLabel, message: v.value.ctaMessage }
          : { type: f.ctaType, value: f.ctaValue, label: f.ctaLabel, message: f.ctaMessage },
        images: i.photos.map((p) => ({ url: p.url, thumbUrl: p.thumbUrl, width: p.width, height: p.height })),
        coverIndex,
      },
      ctx,
    );
    if (view) items.push(view);
  }
  return items.length > 0 ? { title: s.title.trim() || DEFAULT_SECTION_TITLE, items } : null;
}
