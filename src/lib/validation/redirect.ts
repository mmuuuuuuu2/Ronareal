// Mencegah open redirect: parameter `next` hanya boleh berupa path internal yang diizinkan.

const ALLOWED_PREFIXES = ["/dashboard", "/onboarding"] as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export function safeNextPath(raw: unknown, fallback: string = "/dashboard"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();

  if (!value.startsWith("/")) return fallback; // bukan path internal (mis. https://..., javascript:...)
  if (value.startsWith("//")) return fallback; // protocol-relative
  if (value.includes("\\")) return fallback; // /\evil.com dianggap // oleh sebagian browser
  if (CONTROL_CHARS.test(value)) return fallback;

  let pathname: string;
  try {
    const url = new URL(value, "http://rona.invalid");
    if (url.origin !== "http://rona.invalid") return fallback;
    pathname = url.pathname;
  } catch {
    return fallback;
  }

  const allowed = ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return allowed ? value : fallback;
}
