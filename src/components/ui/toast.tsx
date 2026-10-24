"use client";

import { useEffect } from "react";

// Umpan balik status singkat. Sukses hilang sendiri (4 dtk); galat TIDAK hilang otomatis (pengguna perlu waktu membaca/bertindak).
// Timer dibersihkan saat pesan berganti atau komponen dilepas. role=status/alert agar diumumkan pembaca layar.
export const TOAST_SUCCESS_MS = 4000;

export function Toast({
  message, kind, onDismiss,
}: {
  message: string | null;
  kind: "success" | "error";
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message || kind !== "success") return;
    const id = window.setTimeout(onDismiss, TOAST_SUCCESS_MS);
    return () => window.clearTimeout(id);
  }, [message, kind, onDismiss]);

  if (!message) return null;
  return (
    <div className="rona-toast" data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Tutup pemberitahuan">Tutup</button>
    </div>
  );
}
