import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRoute } from "../auth/route-guard.ts";
import { getSupabaseConfig } from "./config.ts";

/**
 * Menyegarkan sesi Supabase dan menegakkan akses route. Memakai getUser() (validasi ke server Auth),
 * bukan getSession() dari cookie, karena data cookie tidak boleh dipercaya untuk keputusan akses.
 * Gagal tertutup: bila pengguna tidak dapat diverifikasi, dianggap belum masuk.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = decideRoute(request.nextUrl.pathname, user !== null);
  if (decision.action === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    // Bawa cookie sesi yang baru disegarkan agar tidak hilang saat redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
