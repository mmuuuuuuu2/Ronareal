// Penyimpanan draft: menentukan GRUP mana yang benar-benar berubah (profil / tampilan) dan revisi yang dibawa.
// Modul murni. Hanya grup yang berubah yang dikirim ke server, sehingga tab yang hanya mengubah tampilan
// tidak pernah menulis ulang (dan menimpa) profil milik tab lain — dan sebaliknya.
import type { PageSettings } from "./settings.ts";
import type { ProfileDraft } from "./state.ts";

export type DraftRevs = { profile: number; settings: number };

export type DraftSavePlan = {
  profile: ProfileDraft | null; // null = tidak berubah, tidak dikirim
  settings: PageSettings | null;
  revs: DraftRevs;
};

const sameProfile = (a: ProfileDraft, b: ProfileDraft) =>
  a.displayName === b.displayName && a.bio === b.bio && a.username === b.username;
const sameSettings = (a: PageSettings, b: PageSettings) =>
  (Object.keys(a) as (keyof PageSettings)[]).every((k) => a[k] === b[k]);

/** Rencana simpan dari state editor. Bila `force` (mis. coba lagi setelah gagal), kirim grup yang dianggap berubah saja. */
export function planDraftSave(input: {
  profile: ProfileDraft;
  savedProfile: ProfileDraft;
  settings: PageSettings;
  savedSettings: PageSettings;
  revs: DraftRevs;
}): DraftSavePlan {
  return {
    profile: sameProfile(input.profile, input.savedProfile) ? null : { ...input.profile },
    settings: sameSettings(input.settings, input.savedSettings) ? null : { ...input.settings },
    revs: { ...input.revs },
  };
}

export const planHasChanges = (p: DraftSavePlan) => p.profile !== null || p.settings !== null;

/** Membaca revisi dari hasil RPC `save_draft` secara defensif. Mengembalikan null bila bentuknya tidak dikenal. */
export function parseSaveResult(raw: unknown): { username: string; revs: DraftRevs } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const p = o.profile_rev;
  const s = o.settings_rev;
  if (typeof o.username !== "string" || !Number.isInteger(p) || !Number.isInteger(s)) return null;
  return { username: o.username, revs: { profile: p as number, settings: s as number } };
}

/** Membaca revisi dari baris database (nilai tak dikenal -> 0). */
export function revFrom(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
