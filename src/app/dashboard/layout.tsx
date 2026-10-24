import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { MotionProvider } from "@/components/motion/motion-provider";
import { RonaMark } from "@/components/rona-mark";
import { getCurrentUser, getProfile } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | RONA" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  // Pengguna yang belum menyelesaikan onboarding tidak boleh masuk dashboard dengan data setengah jadi.
  const profile = await getProfile(user.id);
  if (!profile) redirect("/onboarding");

  return (
    <div className="safe-x mx-auto flex min-h-dvh w-full max-w-6xl flex-col sm:px-6">
      <header className="glass mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3" style={{ marginTop: "max(1rem, var(--rona-safe-top))" }}>
        <Link href="/dashboard" className="flex items-center gap-3 font-semibold" aria-label="RONA, ringkasan dashboard">
          <RonaMark size={32} priority />
          <span className="tracking-tight">RONA</span>
        </Link>
        <nav aria-label="Dashboard" className="rona-nav">
          <Link href="/dashboard" className="btn btn-ghost">
            Ringkasan
          </Link>
          <Link href="/dashboard/editor" className="btn btn-ghost">
            Editor
          </Link>
          <Link href="/dashboard/settings" className="btn btn-ghost">
            Pengaturan
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-primary">
              Keluar
            </button>
          </form>
        </nav>
      </header>
      <main className="flex-1 py-6 sm:py-8" style={{ paddingBottom: "max(2rem, var(--rona-safe-bottom))" }}>
        <MotionProvider>{children}</MotionProvider>
      </main>
    </div>
  );
}
