"use client";

import type { ReactNode } from "react";
import type { SaveStatus } from "./use-saver";

/** Kartu bagian dengan judul + deskripsi singkat (konsisten untuk semua tab pengaturan). */
export function SectionCard({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="surface space-y-4 p-4 sm:p-5">
      <div>
        <h3 id={`${id}-h`} className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm" style={{ color: "var(--rona-fg-muted)" }}>{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Umpan balik hasil simpan di dekat tombol. Konflik menawarkan muat ulang (isian tidak dihapus sampai pengguna memilih). */
export function StatusLine({ status }: { status: SaveStatus }) {
  if (status.kind === "error") {
    return (
      <div className="notice notice-error" role="alert">
        <p>{status.message}</p>
        {status.conflict ? (
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => window.location.reload()}>
            Muat ulang versi terbaru
          </button>
        ) : null}
      </div>
    );
  }
  if (status.kind === "ok") return <p className="notice notice-success" role="status">{status.message}</p>;
  return <p className="sr-only" role="status" aria-live="polite">{status.kind === "saving" ? "Menyimpan…" : ""}</p>;
}
