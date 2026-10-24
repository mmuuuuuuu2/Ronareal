import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware.ts";

// Catatan versi: Next.js 16 mengganti nama konvensi "middleware" menjadi "proxy" (src/proxy.ts, fungsi `proxy`).
// Nama "middleware" masih didukung di Next.js 15 dan 16 (dengan peringatan deprecation di 16), sehingga dipakai di sini
// agar berjalan di keduanya. Verifikasi versi terpasang setelah `npm install`; migrasi ke proxy.ts adalah perubahan kecil.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Hanya rute yang butuh sesi. Halaman publik (landing, /[username] kelak) TIDAK melewati middleware ini,
// sehingga tetap dapat di-cache dan tidak membuat panggilan ke server Auth.
export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login", "/register"],
};
