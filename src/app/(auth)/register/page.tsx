import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Buat akun" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Buat akun RONA</h1>
      <p className="mt-1 mb-5 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
        Setelah mendaftar, kamu akan memilih nama tampilan dan username.
      </p>
      <RegisterForm />
      <p className="mt-6 text-sm">
        Sudah punya akun?{" "}
        <Link href="/login" className="link font-semibold">
          Masuk
        </Link>
      </p>
    </>
  );
}
