"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import type { AuthFormState } from "@/lib/auth/form-state";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="next" value={next} />
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
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
      <SubmitButton pendingLabel="Memeriksa…">Masuk</SubmitButton>
    </form>
  );
}
