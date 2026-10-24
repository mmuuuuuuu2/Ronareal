import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

// Menangani tautan dari email Supabase: alur PKCE (?code=) atau token_hash (?token_hash=&type=).
// Tipe yang diterima: konfirmasi pendaftaran/masuk, KONFIRMASI GANTI EMAIL (email_change) dan atur ulang kata sandi
// (recovery, Phase 7). Setelah recovery, pengguna memiliki sesi dan diarahkan ke `next` (pengaturan akun) untuk mengisi kata sandi baru.
// `next` selalu divalidasi safeNextPath (hanya path internal /dashboard atau /onboarding).
const ALLOWED_OTP_TYPES: readonly EmailOtpType[] = ["signup", "email", "magiclink", "email_change", "recovery"];

function done(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/onboarding");
  const failed = "/login?error=callback";

  if (searchParams.get("error") || searchParams.get("error_code")) return done(request, failed);

  try {
    const supabase = await createSupabaseServerClient();

    const code = searchParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return done(request, error ? failed : next);
    }

    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    if (tokenHash && type && ALLOWED_OTP_TYPES.includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      return done(request, error ? failed : next);
    }
  } catch {
    return done(request, failed);
  }

  return done(request, failed);
}
