import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EditorShell } from "@/components/editor/editor-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { loadEditorData } from "@/lib/editor/load";

export const metadata: Metadata = { title: "Editor halaman" };
export const dynamic = "force-dynamic"; // data pribadi: tidak boleh di-cache atau dibagi antar pengguna

export default async function EditorPage() {
  // Pemeriksaan sesi di server (selain middleware): penyembunyian tombol bukan mekanisme keamanan.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Feditor");

  const data = await loadEditorData(user.id);
  if (!data) redirect("/onboarding");

  return <EditorShell initial={data} />;
}
