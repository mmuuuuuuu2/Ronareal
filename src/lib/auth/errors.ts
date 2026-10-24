// Pemetaan error Supabase -> pesan Indonesia yang aman ditampilkan. Modul murni.
// Prinsip: jangan membocorkan apakah sebuah email sudah terdaftar, dan jangan menampilkan pesan mentah server.

export type AuthErrorLike =
  | { code?: string; status?: number; message?: string; name?: string }
  | null
  | undefined;

const GENERIC = "Terjadi kesalahan. Silakan coba lagi.";

export type AuthContext = "login" | "register" | "email-change" | "password-change" | "reset";

export function mapAuthError(error: AuthErrorLike, context: AuthContext): string {
  if (!error) return GENERIC;
  const { code, status, name } = error;

  if (name === "AuthRetryableFetchError" || status === 0) {
    return "Tidak dapat terhubung ke layanan. Periksa koneksi internet Anda lalu coba lagi.";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429) {
    return "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.";
  }
  if (code === "invalid_credentials") return "Email atau kata sandi salah.";
  if (code === "email_not_confirmed") {
    return "Email Anda belum dikonfirmasi. Periksa kotak masuk (dan folder spam) untuk tautan konfirmasi.";
  }
  if (code === "same_password") return "Kata sandi baru harus berbeda dari kata sandi saat ini.";
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid") {
    return "Untuk alasan keamanan, masuk ulang lalu coba lagi.";
  }
  if (code === "email_address_invalid" || code === "validation_failed") {
    return context === "email-change" ? "Alamat email tidak dapat digunakan. Periksa penulisannya atau gunakan email lain." : GENERIC;
  }
  if (code === "weak_password") return "Kata sandi terlalu lemah. Gunakan kata sandi yang lebih panjang dan unik.";
  if (code === "signup_disabled") return "Pendaftaran akun baru sedang dinonaktifkan.";
  if (context === "email-change" && (code === "email_exists" || code === "user_already_exists")) {
    // Tidak membocorkan apakah email itu sudah terdaftar.
    return "Email tersebut tidak dapat digunakan. Coba email lain.";
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return context === "register"
      ? "Pendaftaran tidak dapat diproses dengan email tersebut. Coba masuk, atau gunakan email lain."
      : GENERIC;
  }
  if (typeof status === "number" && status >= 500) return "Layanan sedang bermasalah. Coba lagi sebentar lagi.";
  return GENERIC;
}

export type ProfileErrorField = "username" | "displayName";
export type ProfileErrorResult = { field?: ProfileErrorField; message: string; alreadyOnboarded?: boolean };

/** Memetakan error RPC claim_profile() (pesan exception dari database) ke pesan pengguna. */
export function mapProfileError(error: { message?: string; code?: string; status?: number } | null | undefined): ProfileErrorResult {
  const text = `${error?.message ?? ""}`;
  if (text.includes("username_taken")) {
    return { field: "username", message: "Username ini sudah dipakai pengguna lain. Coba yang lain." };
  }
  if (text.includes("username_reserved")) {
    return { field: "username", message: "Username ini dicadangkan sistem dan tidak bisa dipakai." };
  }
  if (text.includes("username_invalid")) {
    return { field: "username", message: "Format username tidak valid." };
  }
  if (text.includes("display_name_invalid")) {
    return { field: "displayName", message: "Nama tampilan tidak valid (1–80 karakter, tanpa karakter kontrol)." };
  }
  if (text.includes("profile_exists")) {
    return { message: "Profil Anda sudah dibuat.", alreadyOnboarded: true };
  }
  if (text.includes("not_authenticated")) {
    return { message: "Sesi Anda berakhir. Silakan masuk kembali." };
  }
  if (error?.status === 0 || /fetch failed|network/i.test(text)) {
    return { message: "Tidak dapat terhubung ke layanan. Periksa koneksi internet Anda lalu coba lagi." };
  }
  return { message: "Profil belum dapat disimpan. Silakan coba lagi." };
}
