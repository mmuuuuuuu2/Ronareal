import type { Metadata, Viewport } from "next";
import { normalizeSiteUrl } from "@/lib/env";
import "./globals.css";

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "RONA", template: "%s | RONA" },
  description: "Halaman pribadi untuk semua tautan, layanan, dan katalogmu.",
  applicationName: "RONA",
  // /favicon.ico dilayani otomatis dari src/app/favicon.ico (turunan dari ikon asli RONA).
  icons: {
    icon: [{ url: "/icons/rona-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // isi layar penuh di iPhone berponi; jarak aman diatur lewat env(safe-area-inset-*)
  themeColor: "#F7F6F2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
