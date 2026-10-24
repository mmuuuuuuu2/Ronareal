"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import type { AuthFormState } from "@/lib/auth/form-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

export function RegisterForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(registerAction, {});

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.message ? (
        <p className={state.messageKind === "success" ? "notice notice-success" : "notice notice-error"} role="alert">
          {state.message}
        </p>
      ) : null}
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.email ?? ""}
        error={state.fieldErrors?.email}
        required
      />
      <TextField
        id="password"
        name="password"
        type="password"
        label="Kata sandi"
        autoComplete="new-password"
        hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter.`}
        error={state.fieldErrors?.password}
        required
      />
      <TextField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Ulangi kata sandi"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        required
      />
      <SubmitButton pendingLabel="Membuat akun…">Buat akun</SubmitButton>
    </form>
  );
}
