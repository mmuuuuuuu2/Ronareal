// Stub server action pengaturan UNTUK HARNESS BROWSER (bukan Supabase). Merekam panggilan di window.__calls.
// window.__mode: "ok" (bawaan) | "fail" (galat server) | "conflict" (revisi basi) | "field" (galat per field)
type W = { __calls: { name: string; args: unknown[] }[]; __mode?: string };
const w = window as unknown as W;
w.__calls = w.__calls ?? [];
const rec = (name: string, args: unknown[]) => w.__calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
const wait = () => new Promise((r) => setTimeout(r, 40));
const bad = (field?: string) => {
  if (w.__mode === "fail") return { ok: false as const, message: "Perubahan belum dapat disimpan. Data Anda masih ada di layar; coba lagi.", retryable: true };
  if (w.__mode === "conflict") return { ok: false as const, message: "Draft ini sudah diubah dari tab atau perangkat lain. Isian Anda belum disimpan.", conflict: true };
  if (w.__mode === "field" && field) return { ok: false as const, message: "Username ini sudah dipakai pengguna lain.", fieldErrors: { [field]: "Username ini sudah dipakai pengguna lain." } };
  return null;
};
export async function saveProfileFieldsAction(input: { displayName?: string; bio?: string; rev: number }) {
  rec("saveProfileFieldsAction", [input]); await wait();
  return bad("displayName") ?? { ok: true as const, revs: { profile: input.rev + 1 }, displayName: (input.displayName ?? "Rona").trim(), bio: (input.bio ?? "").trim() };
}
export async function changeUsernameAction(input: { username: string }) {
  rec("changeUsernameAction", [input]); await wait();
  return bad("username") ?? { ok: true as const, username: input.username.trim().toLowerCase(), previous: "rona", profileRev: 5, changed: true };
}
export async function saveSeoAction(input: { seo: any; rev: number }) {
  rec("saveSeoAction", [input]); await wait();
  return bad() ?? { ok: true as const, seo: input.seo, seoRev: input.rev + 1 };
}
export async function requestEmailChangeAction(input: { email: string }) {
  rec("requestEmailChangeAction", [input]); await wait();
  return bad("email") ?? { ok: true as const, pendingEmail: input.email };
}
export async function changePasswordAction(input: { password: string; confirmPassword: string }) {
  rec("changePasswordAction", [{ ...input, password: "***", confirmPassword: "***" }]); await wait();
  if (input.password !== input.confirmPassword) return { ok: false as const, message: "Konfirmasi kata sandi tidak cocok.", fieldErrors: { confirmPassword: "Konfirmasi kata sandi tidak cocok." } };
  return bad("password") ?? { ok: true as const };
}
export async function sendPasswordResetAction() { rec("sendPasswordResetAction", []); await wait(); return bad() ?? { ok: true as const }; }
export async function signOutOthersAction() { rec("signOutOthersAction", []); await wait(); return bad() ?? { ok: true as const }; }
