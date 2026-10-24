// Tipe hasil server action editor. Dipisah dari file "use server" (hanya boleh mengekspor fungsi async).
import type { LinkFields } from "./state.ts";
import type { AssetKind } from "./upload.ts";

export type FieldErrors = Record<string, string>;

export type ActionResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; message: string; fieldErrors?: FieldErrors; retryable?: boolean; signedOut?: boolean; conflict?: boolean };

export type SaveDraftData = {
  // null = grup itu tidak dikirim/tidak diubah (hanya grup yang berubah yang ditulis, lihat draft-save.ts)
  profile: { displayName: string; bio: string; username: string } | null;
  settings: import("./settings.ts").PageSettings | null;
  revs: import("./draft-save.ts").DraftRevs;
};
export type SaveLinkData = { id: string; fields: LinkFields };
export type UploadData = { path: string; url: string | null; kind: AssetKind };
export type RemoveImageData = { kind: AssetKind };

export type PublishData = {
  state: import("../publish/state.ts").PublishState;
  username: string;
};

// --- Katalog (Phase 5)
export type CatalogSettingsData = { enabled: boolean; title: string };
export type SaveCatalogItemData = { id: string; fields: import("../catalog/item.ts").ItemFields };
export type CatalogPhotoData = {
  photo: import("../catalog/state.ts").EditorPhoto;
  coverId: string | null;
};
export type CatalogPhotosState = { coverId: string | null; order: string[] };

// --- Akun & pengaturan halaman (Phase 7)
export type ProfileFieldsData = { revs: { profile: number }; displayName: string; bio: string };
export type UsernameChangeData = { username: string; previous: string; profileRev: number; changed: boolean };
export type SeoSaveData = { seo: import("../seo/seo.ts").SeoSettings; seoRev: number };
export type EmailChangeData = { pendingEmail: string };
export type SimpleOk = Record<never, never>;
