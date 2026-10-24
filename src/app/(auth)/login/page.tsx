import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/validation/redirect";

export const metadata: Metadata = { title: "Masuk" };

// Pesan hanya dipilih dari daftar tetap berdasarkan kode; teks dari URL tidak pernah ditampilkan.
const INFO_MESSAGES: Record<string, string> = {
  "logged-out": "Kamu sudah keluar.",
};
const ERROR_MESSAGES: Record<string, string> = {
  callback: "Tautan konfirmasi tidak valid atau sudah kedaluwarsa. Masuk dengan akunmu, atau daftar ulang untuk meminta tautan baru.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const info = typeof params.info === "string" ? INFO_MESSAGES[params.info] : undefined;
  const error = typeof params.error === "string" ? ERROR_MESSAGES[params.error] : undefined;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);

  return (
    <>
      <h1 className="text-2xl font-semibold">Masuk ke RONA</h1>
      <p className="mt-1 mb-5 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
        Gunakan email dan kata sandi akunmu.
      </p>
      {info ? (
        <p className="notice notice-success mb-4" role="status">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="mt-6 text-sm">
        Belum punya akun?{" "}
        <Link href="/register" className="link font-semibold">
          Buat akun
        </Link>
      </p>
    </>
  );
}
