export async function loginAction(prev: any, fd: FormData) { return { message: "Email atau kata sandi salah.", messageKind: "error" as const }; }
export async function registerAction(prev: any, fd: FormData) { return {}; }
export async function logoutAction() {}
export async function checkUsernameAction(raw: string) {
  const w = window as unknown as { __avail?: string; __calls?: unknown[] };
  (w.__calls ??= []).push({ name: "checkUsernameAction", args: [raw] });
  return { status: w.__avail ?? "available" };
}
export async function claimProfileAction(prev: any, fd: FormData) { return {}; }
