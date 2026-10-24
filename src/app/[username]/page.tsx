import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageView } from "@/components/page/page-view";
import { fetchPublicPage } from "@/lib/publish/fetch";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { getTrustedSiteUrl } from "@/lib/site";

// Halaman publik: dirender statis dan di-cache (ISR). Cache dibersihkan SAAT publish/unpublish lewat
// revalidatePath("/<username>"); angka di bawah hanya jaring pengaman. Rute ini TIDAK boleh memakai cookies()/headers()
// (itu akan membuatnya dinamis dan tidak ter-cache). Nilai harus literal agar bisa dianalisis Next saat build.
export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await fetchPublicPage(username);
  if (result.kind !== "ok") {
    return { title: "Halaman tidak ditemukan", robots: { index: false, follow: false } };
  }
  return buildPageMetadata(result.page, getTrustedSiteUrl());
}

export default async function PublicPage({ params }: Props) {
  const { username } = await params;
  const result = await fetchPublicPage(username);
  if (result.kind !== "ok") notFound(); // tidak ada / belum diterbitkan / sudah dibatalkan: 404 yang sama (tidak membocorkan keberadaan draft)
  return (
    <main>
      <PageView data={result.page.view} mode="live" fill="viewport" />
    </main>
  );
}
