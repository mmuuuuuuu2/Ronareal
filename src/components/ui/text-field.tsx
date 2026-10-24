import type { InputHTMLAttributes } from "react";

// Field berlabel dengan galat yang terhubung ke input (aria-describedby/aria-invalid) agar terbaca pembaca layar.
export function TextField({
  id,
  label,
  error,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: React.ReactNode | undefined;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
