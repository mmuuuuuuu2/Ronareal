"use client";

import Link from "next/link";
import { useEffect } from "react";

// Batas galat untuk seluruh aplikasi. Pesan asli galat tidak ditampilkan (bisa memuat detail internal).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[rona] galat render", error.digest ?? "tanpa-digest"); // pesan asli tidak dicatat di sini (bisa memuat detail internal)
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="glass w-full max-w-md p-6 text-center sm:p-8" role="alert">
        <h1 className="text-2xl font-semibold">Halaman ini tidak dapat dimuat</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
          Terjadi masalah di sisi kami. Coba muat ulang. Jika berulang, tunggu sebentar lalu coba lagi.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs" style={{ color: "var(--rona-fg-muted)" }}>
            Kode rujukan: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Coba lagi
          </button>
          <Link href="/" className="btn btn-ghost">
            Ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
