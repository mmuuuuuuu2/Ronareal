// Stub server action UNTUK HARNESS BROWSER (bukan Supabase). Merekam panggilan di window.__calls.
const w = window as unknown as { __calls: { name: string; args: unknown[] }[]; __conflict?: boolean; __rev?: { profile: number; settings: number } };
w.__calls = w.__calls ?? [];
const rec = (name: string, args: unknown[]) => w.__calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
export async function saveDraftAction(input: any) {
  rec("saveDraftAction", [input]);
  await new Promise((r) => setTimeout(r, 30));
  if (w.__conflict) return { ok: false, message: "Draft ini sudah diubah dari tab atau perangkat lain. Perubahan Anda belum disimpan dan masih ada di layar. Muat ulang untuk melihat versi terbaru, lalu terapkan kembali perubahan Anda.", conflict: true };
  const r = input.revs;
  return { ok: true, profile: input.profile, settings: input.settings, revs: { profile: r.profile + (input.profile ? 1 : 0), settings: r.settings + (input.settings ? 1 : 0) } };
}
const generic = (name: string) => async (...args: unknown[]) => { rec(name, args); return { ok: true }; };
export const createLinkAction = generic("createLinkAction"), updateLinkAction = generic("updateLinkAction"), toggleLinkAction = generic("toggleLinkAction"),
  deleteLinkAction = generic("deleteLinkAction"), reorderLinksAction = generic("reorderLinksAction"), uploadImageAction = generic("uploadImageAction"), removeImageAction = generic("removeImageAction");
const pubState = (isPublished: boolean) => ({ isPublished, version: 1, publishedAt: "2026-10-21T05:00:00Z", hasChanges: false });
export async function publishAction() { rec("publishAction", []); await new Promise((r) => setTimeout(r, 30)); return { ok: true, state: pubState(true), username: "rona" }; }
export async function unpublishAction() { rec("unpublishAction", []); await new Promise((r) => setTimeout(r, 30)); return { ok: true, state: pubState(false), username: "rona" }; }
export const saveCatalogSettingsAction = generic("saveCatalogSettingsAction"), createCatalogItemAction = generic("createCatalogItemAction"), updateCatalogItemAction = generic("updateCatalogItemAction"),
  toggleCatalogItemAction = generic("toggleCatalogItemAction"), deleteCatalogItemAction = generic("deleteCatalogItemAction"), reorderCatalogItemsAction = generic("reorderCatalogItemsAction"),
  uploadCatalogPhotoAction = generic("uploadCatalogPhotoAction"), deleteCatalogPhotoAction = generic("deleteCatalogPhotoAction"), reorderCatalogPhotosAction = generic("reorderCatalogPhotosAction"), setCatalogCoverAction = generic("setCatalogCoverAction");
