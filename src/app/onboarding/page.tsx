import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { RonaMark } from "@/components/rona-mark";
import { getCurrentUser, getProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Lengkapi profil", robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  // Middleware sudah melindungi rute ini; pemeriksaan ulang di sini adalah lapisan kedua.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fonboarding");

  const profile = await getProfile(user.id);
  if (profile) redirect("/dashboard");

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 font-semibold" aria-label="RONA, halaman utama">
          <RonaMark size={44} priority />
          <span className="text-xl tracking-tight">RONA</span>
        </Link>
        <main className="glass p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">Lengkapi profilmu</h1>
          <p className="mt-1 mb-5 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
            Dua langkah singkat sebelum masuk ke dashboard. Username menentukan alamat halamanmu dan tidak bisa
            dipakai orang lain.
          </p>
          <OnboardingForm />
        </main>
      </div>
    </div>
  );
}
