import type { Metadata } from "next";
import Link from "next/link";
import { RonaMark } from "@/components/rona-mark";

// Halaman autentikasi tidak boleh diindeks mesin pencari.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="safe-x grid min-h-dvh place-items-center py-8" style={{ paddingTop: "max(2rem, var(--rona-safe-top))", paddingBottom: "max(2rem, var(--rona-safe-bottom))" }}>
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 font-semibold" aria-label="RONA, halaman utama">
          <RonaMark size={44} priority />
          <span className="text-xl tracking-tight">RONA</span>
        </Link>
        <main className="glass p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
