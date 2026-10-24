// Keputusan akses route — modul murni. Dipakai middleware; halaman server memeriksa ulang (defense in depth).

export type GuardDecision = { action: "next" } | { action: "redirect"; to: string };

const PROTECTED_BASES = ["/dashboard", "/onboarding"] as const;
const GUEST_ONLY_PATHS = ["/login", "/register"] as const;

function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideRoute(pathname: string, hasUser: boolean): GuardDecision {
  if (!hasUser && PROTECTED_BASES.some((base) => under(pathname, base))) {
    // Hanya pathname yang diteruskan; safeNextPath() memvalidasi ulang saat login.
    return { action: "redirect", to: `/login?next=${encodeURIComponent(pathname)}` };
  }
  if (hasUser && GUEST_ONLY_PATHS.some((p) => pathname === p)) {
    return { action: "redirect", to: "/dashboard" };
  }
  return { action: "next" };
}
