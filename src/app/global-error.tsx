"use client";

import "./globals.css";

// Dipakai hanya bila layout root sendiri gagal; harus menyertakan <html> dan <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body>
        <div className="grid min-h-dvh place-items-center px-4">
          <div className="glass w-full max-w-md p-6 text-center sm:p-8" role="alert">
            <h1 className="text-2xl font-semibold">RONA tidak dapat dimuat</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
              Terjadi masalah saat memuat aplikasi. Coba muat ulang.
            </p>
            <button type="button" className="btn btn-primary mt-6" onClick={() => reset()}>
              Coba lagi
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
