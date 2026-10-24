"use server";

import { redirect } from "next/navigation";
import { mapProfileError } from "@/lib/auth/errors";
import type { OnboardingFormState, UsernameCheckStatus } from "@/lib/auth/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateDisplayName } from "@/lib/validation/auth";
import { normalizeUsername, validateUsername } from "@/lib/validation/username";

// Database adalah sumber kebenaran: validasi di sini hanya mempercepat umpan balik; claim_profile() memeriksa ulang
// format, daftar reserved, dan keunikan username di dalam satu transaksi. Identitas diambil dari sesi, bukan dari form.

export async function checkUsernameAction(raw: string): Promise<{ status: UsernameCheckStatus }> {
  const validation = validateUsername(raw);
  if (!validation.ok) return { status: "invalid" };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Hanya pengguna yang sudah masuk yang boleh memeriksa (mengurangi penyalahgunaan untuk menebak username).
    if (!user) return { status: "error" };

    const { data, error } = await supabase.rpc("is_username_available", { p_username: validation.value });
    if (error) return { status: "error" };
    return { status: data === true ? "available" : "unavailable" };
  } catch {
    return { status: "error" };
  }
}

export async function claimProfileAction(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const rawDisplayName = formData.get("displayName");
  const values = {
    username: normalizeUsername(formData.get("username")),
    displayName: typeof rawDisplayName === "string" ? rawDisplayName : "",
  };

  const displayName = validateDisplayName(rawDisplayName);
  const username = validateUsername(formData.get("username"));
  if (!displayName.ok || !username.ok) {
    return {
      values,
      fieldErrors: {
        ...(displayName.ok ? {} : { displayName: displayName.message }),
        ...(username.ok ? {} : { username: username.message }),
      },
    };
  }

  let outcome: ReturnType<typeof mapProfileError> | null = null;
  let signedOut = false;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      signedOut = true;
    } else {
      const { error } = await supabase.rpc("claim_profile", {
        p_username: username.value,
        p_display_name: displayName.value,
      });
      if (error) outcome = mapProfileError(error);
    }
  } catch (caught) {
    outcome = mapProfileError({ message: caught instanceof Error ? caught.message : "network" });
  }

  if (signedOut) redirect("/login?next=%2Fonboarding");
  if (outcome?.alreadyOnboarded) redirect("/dashboard");
  if (outcome) {
    return outcome.field
      ? { values, fieldErrors: { [outcome.field]: outcome.message } }
      : { values, message: outcome.message };
  }

  redirect("/dashboard");
}
