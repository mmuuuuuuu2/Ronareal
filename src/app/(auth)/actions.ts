"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { mapAuthError } from "@/lib/auth/errors";
import type { AuthFormState } from "@/lib/auth/form-state";
import { normalizeSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeEmail, validateLogin, validateRegistration } from "@/lib/validation/auth";
import { safeNextPath } from "@/lib/validation/redirect";

// Semua validasi dijalankan ULANG di server (validasi di browser hanya untuk kenyamanan).
// Password tidak pernah disimpan/dicatat oleh aplikasi; hanya diteruskan ke Supabase Auth.
// Catatan: redirect() melempar exception khusus, jadi tidak boleh dipanggil di dalam try/catch.

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const parsed = validateLogin({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email };

  let failure: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.value);
    if (error) failure = mapAuthError(error, "login");
  } catch {
    failure = mapAuthError({ name: "AuthRetryableFetchError", status: 0 }, "login");
  }
  if (failure) return { message: failure, messageKind: "error", email };

  redirect(safeNextPath(formData.get("next")));
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const parsed = validateRegistration({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email };

  const requestHeaders = await headers();
  const siteUrl =
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteUrl(requestHeaders.get("origin")) ??
    "http://localhost:3000";

  let failure: string | null = null;
  let hasSession = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.value.email,
      password: parsed.value.password,
      // Supabase hanya mengizinkan URL yang terdaftar di Authentication > URL Configuration.
      options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding` },
    });
    if (error) failure = mapAuthError(error, "register");
    else hasSession = data.session !== null;
  } catch {
    failure = mapAuthError({ name: "AuthRetryableFetchError", status: 0 }, "register");
  }
  if (failure) return { message: failure, messageKind: "error", email };

  // Konfirmasi email dimatikan di proyek Supabase -> sesi langsung ada.
  if (hasSession) redirect("/onboarding");

  // Pesan sama untuk email baru maupun yang sudah terdaftar (tidak membocorkan keberadaan akun).
  return {
    message: `Jika email ${parsed.value.email} dapat didaftarkan, tautan konfirmasi sudah dikirim. Periksa kotak masuk dan folder spam, lalu buka tautannya untuk melanjutkan.`,
    messageKind: "success",
    email: parsed.value.email,
  };
}

export async function logoutAction(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Bila gagal menghubungi server Auth, tetap arahkan ke login; cookie sesi dibersihkan di panggilan berikutnya.
  }
  redirect("/login?info=logged-out");
}
