// Tipe state formulir untuk server action. Dipisah dari file "use server" (file itu hanya boleh mengekspor fungsi async).

export type AuthFormState = {
  message?: string;
  messageKind?: "error" | "success";
  fieldErrors?: Record<string, string>;
  email?: string;
};

export type OnboardingFormState = {
  message?: string;
  fieldErrors?: { username?: string; displayName?: string };
  values?: { username: string; displayName: string };
};

export type UsernameCheckStatus = "available" | "unavailable" | "invalid" | "error";
