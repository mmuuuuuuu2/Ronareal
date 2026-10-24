import type { NextConfig } from "next";

// Header keamanan dasar untuk semua rute. CSP ketat (dengan nonce) sengaja ditunda ke fase hardening.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // hanya berlaku lewat HTTPS
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Rute privat/autentikasi tidak boleh masuk cache bersama (CDN/proxy) maupun cache peramban publik.
const noStore = [{ key: "Cache-Control", value: "private, no-store" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Unggahan gambar (sudah dikompres di browser, maks. 5 MB) lewat Server Action. Batas bawaan 1 MB terlalu kecil.
  // Catatan: lokasi opsi ini (experimental.serverActions) belum diverifikasi terhadap versi Next terpasang.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/dashboard/:path*", headers: noStore },
      { source: "/onboarding/:path*", headers: noStore },
      { source: "/login", headers: noStore },
      { source: "/register", headers: noStore },
      { source: "/auth/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;
