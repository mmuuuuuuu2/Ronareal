"use server";

import { revalidatePath } from "next/cache";
import type {
  ActionResult, EmailChangeData, ProfileFieldsData, SeoSaveData, SimpleOk, UsernameChangeData,
} from "@/lib/editor/action-types";
import { emailStatus, validateEmailChange, validateNewPassword } from "@/lib/account/account";
import { mapAuthError } from "@/lib/auth/errors";
import { revFrom } from "@/lib/editor/draft-save";
import { mapEditorError } from "@/lib/editor/errors";
import { logServerError } from "@/lib/log";
import { publicPath } from "@/lib/publish/state";
import { sanitizeSeo, validateSeo } from "@/lib/seo/seo";
import { getTrustedSiteUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateDisplayName } from "@/lib/validation/auth";
import { BIO_MAX_LENGTH } from "@/lib/validation/profile";
import { validateUsername } from "@/lib/validation/username";

// Pengaturan akun & halaman (Phase 7). Identitas HANYA dari sesi server (getUser); tidak ada user id/username lama/path dari
// client yang dipercaya. Semua input divalidasi ulang di sini, lalu divalidasi lagi oleh RPC database (defense in depth).
// Kata sandi tidak pernah dicatat atau dikembalikan. Token/sesi tidak pernah dikirim ke client.

const SIGNED_OUT = { ok: false, message: "Sesi Anda berakhir. Silakan masuk kembali.", signedOut: true } as const;

async function session() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

type Failure = { ok: false; message: string; fieldErrors?: Record<string, string>; retryable?: boolean; conflict?: boolean };

function fail(error: unknown, fallbackField?: string): Failure {
  const err = typeof error === "object" && error !== null ? (error as { message?: string; status?: number }) : { message: String(error) };
  logServerError("settings", error);
  const m = mapEditorError(err);
  const field = m.field ?? fallbackField;
  return {
    ok: false,
    message: m.message,
    retryable: m.retryable,
    ...(/draft_conflict/.test(err.message ?? "") ? { conflict: true } : {}),
    ...(field ? { fieldErrors: { [field]: m.message } } : {}),
  };
}

const intRev = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** Nama tampilan dan/atau bio (parsial; kolom lain tidak disentuh). Revisi profil dicek di database. */
export async function saveProfileFieldsAction(input: {
  displayName?: string; bio?: string; rev: number;
}): Promise<ActionResult<ProfileFieldsData>> {
  try {
    const rev = intRev(input?.rev);
    if (rev === null) return { ok: false, message: "Data tidak valid. Muat ulang halaman." };
    const patch: Record<string, string> = {};
    const errors: Record<string, string> = {};
    if (input.displayName !== undefined) {
      const n = validateDisplayName(input.displayName);
      if (n.ok) patch.displayName = n.value; else errors.displayName = n.message;
    }
    if (input.bio !== undefined) {
      const bio = typeof input.bio === "string" ? input.bio.replace(/\r\n/g, "\n").trim() : "";
      // eslint-disable-next-line no-control-regex
      if (Array.from(bio).length > BIO_MAX_LENGTH) errors.bio = `Deskripsi maksimal ${BIO_MAX_LENGTH} karakter.`;
      // eslint-disable-next-line no-control-regex
      else if (/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/.test(bio)) errors.bio = "Deskripsi mengandung karakter yang tidak diizinkan.";
      else patch.bio = bio;
    }
    if (Object.keys(errors).length > 0) return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors: errors };
    if (Object.keys(patch).length === 0) return { ok: false, message: "Tidak ada perubahan untuk disimpan." };

    const s = await session();
    if (!s) return SIGNED_OUT;
    const { data, error } = await s.supabase.rpc("update_profile_fields", { p_patch: patch, p_rev: rev });
    if (error) return fail(error, "displayName");
    const o = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return {
      ok: true,
      revs: { profile: revFrom(o.profile_rev) },
      displayName: typeof o.display_name === "string" ? o.display_name : "",
      bio: typeof o.bio === "string" ? o.bio : "",
    };
  } catch (caught) {
    return fail(caught);
  }
}

/**
 * Ganti username. Username lama dibaca dari DATABASE milik sesi (bukan dari client). Invalidasi cache untuk URL lama DAN baru:
 * lama -> 404 (tidak ada redirect otomatis), baru -> melayani halaman yang sama. Berlaku langsung walau halaman terbit
 * (username adalah kunci URL, bukan bagian draft); isi halaman tidak berubah sampai Publish.
 */
export async function changeUsernameAction(input: { username: string }): Promise<ActionResult<UsernameChangeData>> {
  try {
    const v = validateUsername(input?.username);
    if (!v.ok) return { ok: false, message: v.message, fieldErrors: { username: v.message } };
    const s = await session();
    if (!s) return SIGNED_OUT;
    const before = await s.supabase.from("profiles").select("username").eq("id", s.user.id).maybeSingle();
    if (before.error || !before.data) return fail(before.error ?? { message: "profile_missing" });
    const previous = before.data.username as string;
    if (previous === v.value) return { ok: true, username: previous, previous, profileRev: -1, changed: false };

    const { data, error } = await s.supabase.rpc("change_username", { p_username: v.value });
    if (error) return fail(error, "username");
    const username = typeof data === "string" ? data : v.value;
    const after = await s.supabase.from("profiles").select("profile_rev").eq("id", s.user.id).maybeSingle();

    revalidatePath(publicPath(previous)); // URL lama: tidak lagi ada halaman (404)
    revalidatePath(publicPath(username)); // URL baru: buang cache lama (mis. 404 sebelumnya)
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, username, previous, profileRev: revFrom(after.data?.profile_rev), changed: username !== previous };
  } catch (caught) {
    return fail(caught, "username");
  }
}

/** SEO & berbagi sosial: hanya mengubah draft_config.seo (revisi terpisah). Halaman live berubah SETELAH Publish. */
export async function saveSeoAction(input: { seo: unknown; rev: number }): Promise<ActionResult<SeoSaveData>> {
  try {
    const rev = intRev(input?.rev);
    if (rev === null) return { ok: false, message: "Data tidak valid. Muat ulang halaman." };
    const v = validateSeo(input.seo);
    if (!v.ok) return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors: v.errors };
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { data, error } = await s.supabase.rpc("save_seo", { p_seo: v.value, p_rev: rev });
    if (error) return fail(error);
    const o = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    revalidatePath("/dashboard"); // draft tidak memengaruhi halaman publik, jadi /username TIDAK di-invalidasi di sini
    revalidatePath("/dashboard/settings");
    return { ok: true, seo: sanitizeSeo(o.seo), seoRev: revFrom(o.seo_rev) };
  } catch (caught) {
    return fail(caught);
  }
}

/**
 * Ganti email lewat Supabase Auth (updateUser). Perubahan BELUM berlaku: Supabase mengirim tautan konfirmasi (dan, bila
 * "Secure email change" aktif, ke email lama juga). Hasil "ok" hanya berarti permintaan diterima; email aktif tidak berubah
 * sampai dikonfirmasi — UI membaca `new_email` dari Supabase.
 */
export async function requestEmailChangeAction(input: { email: string }): Promise<ActionResult<EmailChangeData>> {
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const v = validateEmailChange(input?.email, s.user.email);
    if (!v.ok) return { ok: false, message: Object.values(v.errors)[0] ?? "Email tidak valid.", fieldErrors: v.errors };
    const site = getTrustedSiteUrl();
    const { data, error } = await s.supabase.auth.updateUser(
      { email: v.value.email },
      site ? { emailRedirectTo: `${site}/auth/callback?next=/dashboard/settings` } : undefined,
    );
    if (error) {
      const message = mapAuthError(error, "email-change");
      return { ok: false, message, fieldErrors: { email: message } };
    }
    const status = emailStatus(data.user ?? {});
    revalidatePath("/dashboard/settings");
    return { ok: true, pendingEmail: status.pending ?? v.value.email };
  } catch {
    const message = mapAuthError({ name: "AuthRetryableFetchError", status: 0 }, "email-change");
    return { ok: false, message, retryable: true };
  }
}

/** Ganti kata sandi (pengguna sudah masuk). Kata sandi hanya diteruskan ke Supabase Auth; tidak dicatat, tidak dikembalikan. */
export async function changePasswordAction(input: { password: string; confirmPassword: string }): Promise<ActionResult<SimpleOk>> {
  try {
    const v = validateNewPassword(input?.password, input?.confirmPassword);
    if (!v.ok) return { ok: false, message: Object.values(v.errors)[0] ?? "Kata sandi tidak valid.", fieldErrors: v.errors };
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.auth.updateUser({ password: v.value.password });
    if (error) {
      const message = mapAuthError(error, "password-change");
      return { ok: false, message, fieldErrors: { password: message } };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: mapAuthError({ name: "AuthRetryableFetchError", status: 0 }, "password-change"), retryable: true };
  }
}

/** Kirim tautan atur ulang kata sandi ke email AKUN SENDIRI (alamat tidak diterima dari client). */
export async function sendPasswordResetAction(): Promise<ActionResult<SimpleOk>> {
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    if (!s.user.email) return { ok: false, message: "Akun ini tidak memiliki email." };
    const site = getTrustedSiteUrl();
    const { error } = await s.supabase.auth.resetPasswordForEmail(
      s.user.email,
      site ? { redirectTo: `${site}/auth/callback?next=/dashboard/settings` } : undefined,
    );
    if (error) return { ok: false, message: mapAuthError(error, "reset") };
    return { ok: true };
  } catch {
    return { ok: false, message: mapAuthError({ name: "AuthRetryableFetchError", status: 0 }, "reset"), retryable: true };
  }
}

/** Keluar dari perangkat/sesi LAIN; sesi ini tetap aktif. (Keluar penuh memakai logoutAction yang sudah ada.) */
export async function signOutOthersAction(): Promise<ActionResult<SimpleOk>> {
  try {
    const s = await session();
    if (!s) return SIGNED_OUT;
    const { error } = await s.supabase.auth.signOut({ scope: "others" });
    if (error) return { ok: false, message: "Belum berhasil mengeluarkan perangkat lain. Coba lagi.", retryable: true };
    return { ok: true };
  } catch {
    return { ok: false, message: "Tidak dapat terhubung ke layanan. Coba lagi.", retryable: true };
  }
}
