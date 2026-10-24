"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { checkUsernameAction, claimProfileAction } from "@/app/onboarding/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import type { OnboardingFormState } from "@/lib/auth/form-state";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validation/auth";
import { USERNAME_MAX_LENGTH, normalizeUsername, validateUsername } from "@/lib/validation/username";

type Remote = { value: string; status: "available" | "unavailable" | "error" };

const DEBOUNCE_MS = 450;

export function OnboardingForm() {
  const [state, formAction] = useActionState<OnboardingFormState, FormData>(claimProfileAction, {});
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [remote, setRemote] = useState<Remote | null>(null);
  const latestCandidate = useRef("");

  const local = validateUsername(username);
  const candidate = local.ok ? local.value : "";

  // Cek ketersediaan hanya bila format lokal valid, setelah jeda mengetik, dan hanya untuk nilai terakhir.
  // Hasil basi (nilai sudah berubah) diabaikan. Tidak ada polling dan tidak ada panggilan saat render.
  useEffect(() => {
    latestCandidate.current = candidate;
    if (!candidate) return;
    const timer = setTimeout(async () => {
      let status: Remote["status"] = "error";
      try {
        const result = await checkUsernameAction(candidate);
        status =
          result.status === "available" ? "available" : result.status === "unavailable" ? "unavailable" : "error";
      } catch {
        status = "error";
      }
      if (latestCandidate.current === candidate) setRemote({ value: candidate, status });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [candidate]);

  const serverUsernameError =
    state.fieldErrors?.username && state.values?.username === normalizeUsername(username)
      ? state.fieldErrors.username
      : undefined;

  let usernameStatus: { tone: "hint" | "error" | "ok"; text: string };
  if (serverUsernameError) {
    usernameStatus = { tone: "error", text: serverUsernameError };
  } else if (!username.trim()) {
    usernameStatus = { tone: "hint", text: "3–30 karakter: huruf kecil, angka, tanda hubung (-), dan garis bawah (_)." };
  } else if (!local.ok) {
    usernameStatus = { tone: "error", text: local.message };
  } else if (remote?.value !== candidate) {
    usernameStatus = { tone: "hint", text: "Memeriksa ketersediaan…" };
  } else if (remote.status === "available") {
    usernameStatus = { tone: "ok", text: "Username tersedia." };
  } else if (remote.status === "unavailable") {
    usernameStatus = { tone: "error", text: "Username ini sudah dipakai atau dicadangkan sistem." };
  } else {
    usernameStatus = { tone: "hint", text: "Ketersediaan belum bisa diperiksa. Kamu tetap bisa mencoba menyimpan." };
  }

  const toneClass =
    usernameStatus.tone === "error" ? "field-error" : usernameStatus.tone === "ok" ? "field-ok" : "field-hint";

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.message ? (
        <p className="notice notice-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <TextField
        id="displayName"
        name="displayName"
        label="Nama tampilan"
        autoComplete="name"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        hint="Nama yang tampil di halaman pribadimu."
        error={state.fieldErrors?.displayName}
        required
      />

      <div>
        <label htmlFor="username" className="field-label">
          Username
        </label>
        <input
          id="username"
          name="username"
          className="field-input"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX_LENGTH}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-invalid={usernameStatus.tone === "error" ? true : undefined}
          aria-describedby="username-status"
          required
        />
        <p id="username-status" className={toneClass} role="status" aria-live="polite">
          {usernameStatus.text}
        </p>
        {local.ok ? (
          <p className="field-hint">
            Alamat halamanmu akan berbentuk <strong>/{local.value}</strong>.
          </p>
        ) : null}
      </div>

      <SubmitButton pendingLabel="Menyimpan…">Simpan dan lanjut</SubmitButton>
    </form>
  );
}
