// State editor — reducer murni (tanpa React/DOM) sehingga mudah diuji. Seluruh perubahan ketikan hanya
// mengubah state lokal; database baru disentuh saat pengguna menekan simpan (tidak ada request per ketukan).
import type { DraftRevs } from "./draft-save.ts";
import type { LinkIconKey } from "./icons.ts";
import { DEFAULT_SETTINGS, type PageSettings } from "./settings.ts";
import type { PageViewData } from "./view-data.ts";
import { safeHref } from "../validation/url.ts";

export type ProfileDraft = { displayName: string; bio: string; username: string };

export type LinkFields = { title: string; url: string; description: string; icon: LinkIconKey | null };

export type EditorLink = LinkFields & {
  id: string; // id database; link baru memakai "new:<n>" sampai tersimpan
  isVisible: boolean;
  imagePath: string | null;
  imageUrl: string | null; // signed URL sementara dari bucket privat (hanya untuk tampilan)
  saved: LinkFields | null; // snapshot terakhir yang tersimpan (null = belum pernah disimpan)
  status: "idle" | "saving" | "error";
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string; conflict?: boolean };

export type EditorState = {
  profile: ProfileDraft;
  savedProfile: ProfileDraft;
  settings: PageSettings;
  savedSettings: PageSettings;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  links: EditorLink[];
  revs: DraftRevs; // revisi terakhir yang diketahui editor (untuk optimistic concurrency di server)
  save: SaveState;
  profileErrors: Record<string, string>;
  nextTempId: number;
};

export type EditorAction =
  | { type: "profile/set"; field: keyof ProfileDraft; value: string }
  | { type: "settings/set"; patch: Partial<PageSettings> }
  | { type: "settings/reset" }
  | { type: "draft/saving" }
  | {
      type: "draft/saved";
      profile?: ProfileDraft | null; // nilai terkonfirmasi server; null/undefined = grup ini tidak ikut disimpan
      settings?: PageSettings | null;
      sent?: { profile: ProfileDraft | null; settings: PageSettings | null }; // yang DIKIRIM; ketikan baru saat menyimpan tidak ditimpa
      revs?: DraftRevs;
      at: number;
    }
  | { type: "draft/failed"; message: string; fieldErrors?: Record<string, string>; conflict?: boolean }
  | { type: "avatar/set"; url: string | null }
  | { type: "background/set"; url: string | null }
  | { type: "link/add" }
  | { type: "link/edit"; id: string; patch: Partial<LinkFields> }
  | { type: "link/saving"; id: string }
  | { type: "link/saved"; id: string; newId: string; fields: LinkFields }
  | { type: "link/failed"; id: string; message: string; fieldErrors?: Record<string, string> }
  | { type: "link/discard"; id: string }
  | { type: "link/remove"; id: string }
  | { type: "link/visible"; id: string; value: boolean }
  | { type: "link/image"; id: string; path: string | null; url: string | null }
  | { type: "links/replace"; links: EditorLink[] }
  | { type: "links/move"; id: string; direction: -1 | 1 };

export function initialEditorState(input: {
  profile: ProfileDraft;
  settings: PageSettings;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  links: EditorLink[];
  revs?: DraftRevs;
}): EditorState {
  return {
    profile: { ...input.profile },
    savedProfile: { ...input.profile },
    settings: { ...input.settings },
    savedSettings: { ...input.settings },
    avatarUrl: input.avatarUrl,
    backgroundUrl: input.backgroundUrl,
    links: input.links,
    revs: input.revs ? { ...input.revs } : { profile: 0, settings: 0 },
    save: { status: "idle" },
    profileErrors: {},
    nextTempId: 1,
  };
}

/** Memindahkan elemen; mengembalikan array baru (atau array yang sama bila tidak ada perubahan). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = items.slice();
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

const sameProfile = (a: ProfileDraft, b: ProfileDraft) =>
  a.displayName === b.displayName && a.bio === b.bio && a.username === b.username;

const sameSettings = (a: PageSettings, b: PageSettings) =>
  (Object.keys(a) as (keyof PageSettings)[]).every((k) => a[k] === b[k]);

export const isDraftDirty = (s: EditorState) =>
  !sameProfile(s.profile, s.savedProfile) || !sameSettings(s.settings, s.savedSettings);

export const isNewLink = (l: EditorLink) => l.id.startsWith("new:");

export function isLinkDirty(l: EditorLink): boolean {
  if (!l.saved) return true;
  return (
    l.title !== l.saved.title || l.url !== l.saved.url || l.description !== l.saved.description || l.icon !== l.saved.icon
  );
}

/** Ada pekerjaan yang belum tersimpan? (dipakai untuk peringatan saat meninggalkan halaman) */
export const hasUnsavedChanges = (s: EditorState) => isDraftDirty(s) || s.links.some(isLinkDirty);

const mapLink = (links: EditorLink[], id: string, fn: (l: EditorLink) => EditorLink) =>
  links.map((l) => (l.id === id ? fn(l) : l));

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "profile/set": {
      const errors = { ...state.profileErrors };
      delete errors[action.field];
      return { ...state, profile: { ...state.profile, [action.field]: action.value }, profileErrors: errors };
    }
    case "settings/set":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "settings/reset":
      return { ...state, settings: { ...DEFAULT_SETTINGS } };
    case "draft/saving":
      return { ...state, save: { status: "saving" }, profileErrors: {} };
    case "draft/saved": {
      // Hanya grup yang benar-benar disimpan yang diperbarui. Bila pengguna sudah mengetik lagi selama proses simpan,
      // ketikan terbaru dipertahankan (tetap "belum disimpan"), bukan ditimpa nilai lama dari server.
      const sent = action.sent;
      const keepProfile = action.profile && sent?.profile && !sameProfile(state.profile, sent.profile);
      const keepSettings = action.settings && sent?.settings && !sameSettings(state.settings, sent.settings);
      return {
        ...state,
        profile: action.profile && !keepProfile ? action.profile : state.profile,
        savedProfile: action.profile ?? state.savedProfile,
        settings: action.settings && !keepSettings ? action.settings : state.settings,
        savedSettings: action.settings ?? state.savedSettings,
        revs: action.revs ?? state.revs,
        save: { status: "saved", at: action.at },
        profileErrors: {},
      };
    }
    case "draft/failed":
      // Input pengguna TIDAK diubah/dihapus saat gagal — hanya menampilkan galat agar bisa dicoba lagi.
      return {
        ...state,
        save: { status: "error", message: action.message, ...(action.conflict ? { conflict: true } : {}) },
        profileErrors: action.fieldErrors ?? {},
      };
    case "avatar/set":
      return { ...state, avatarUrl: action.url };
    case "background/set":
      return { ...state, backgroundUrl: action.url };
    case "link/add": {
      const id = `new:${state.nextTempId}`;
      const fresh: EditorLink = {
        id, title: "", url: "", description: "", icon: null, isVisible: true,
        imagePath: null, imageUrl: null, saved: null, status: "idle",
      };
      return { ...state, links: [...state.links, fresh], nextTempId: state.nextTempId + 1 };
    }
    case "link/edit":
      return {
        ...state,
        links: mapLink(state.links, action.id, (l) => {
          const fieldErrors = { ...(l.fieldErrors ?? {}) };
          for (const k of Object.keys(action.patch)) delete fieldErrors[k];
          return { ...l, ...action.patch, status: l.status === "saving" ? "saving" : "idle", error: undefined, fieldErrors };
        }),
      };
    case "link/saving":
      return { ...state, links: mapLink(state.links, action.id, (l) => ({ ...l, status: "saving", error: undefined })) };
    case "link/saved":
      return {
        ...state,
        links: mapLink(state.links, action.id, (l) => ({
          ...l, ...action.fields, id: action.newId, saved: { ...action.fields }, status: "idle", error: undefined, fieldErrors: {},
        })),
      };
    case "link/failed":
      return {
        ...state,
        links: mapLink(state.links, action.id, (l) => ({
          ...l, status: "error", error: action.message, fieldErrors: action.fieldErrors ?? {},
        })),
      };
    case "link/discard": {
      // Batalkan perubahan yang belum tersimpan; link yang belum pernah tersimpan dibuang.
      return {
        ...state,
        links: state.links.flatMap((l) => {
          if (l.id !== action.id) return [l];
          return l.saved ? [{ ...l, ...l.saved, status: "idle" as const, error: undefined, fieldErrors: {} }] : [];
        }),
      };
    }
    case "link/remove":
      return { ...state, links: state.links.filter((l) => l.id !== action.id) };
    case "link/visible":
      return { ...state, links: mapLink(state.links, action.id, (l) => ({ ...l, isVisible: action.value })) };
    case "link/image":
      return { ...state, links: mapLink(state.links, action.id, (l) => ({ ...l, imagePath: action.path, imageUrl: action.url })) };
    case "links/replace":
      return { ...state, links: action.links };
    case "links/move": {
      const from = state.links.findIndex((l) => l.id === action.id);
      if (from < 0) return state;
      return { ...state, links: moveItem(state.links, from, from + action.direction) };
    }
    default:
      return state;
  }
}

/** Data untuk PageView dari state lokal (live preview). Link tak valid/kosong/tersembunyi tidak ditampilkan. */
export function toPreviewData(s: EditorState): PageViewData {
  return {
    displayName: s.profile.displayName.trim() || "Nama tampilan",
    username: s.profile.username.trim() || "username",
    bio: s.profile.bio,
    avatarUrl: s.avatarUrl,
    backgroundUrl: s.backgroundUrl,
    settings: s.settings,
    links: s.links
      .filter((l) => l.isVisible && l.title.trim() !== "" && safeHref(l.url) !== null)
      .map((l) => ({
        id: l.id, title: l.title.trim(), url: l.url.trim(), description: l.description.trim(), icon: l.icon, imageUrl: l.imageUrl,
      })),
  };
}
