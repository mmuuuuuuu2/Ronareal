import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings/settings-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { loadSettings } from "@/lib/settings/load";
import { parseSettingsTab } from "@/lib/settings/tabs";
import { getTrustedSiteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Pengaturan" };
export const dynamic = "force-dynamic"; // data akun pribadi: tidak boleh di-cache atau dibagi antar pengguna

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Fsettings");
  const data = await loadSettings(user);
  if (!data) redirect("/onboarding");
  const { tab } = await searchParams;
  return <SettingsShell initial={data} siteUrl={getTrustedSiteUrl()} initialTab={parseSettingsTab(tab)} />;
}
