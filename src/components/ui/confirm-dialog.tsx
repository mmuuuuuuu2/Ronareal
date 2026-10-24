"use client";

import { useEffect, useId, useRef, type MouseEvent } from "react";

// Dialog konfirmasi bersama (hapus tautan/item, dll.). Elemen <dialog> native + showModal():
// fokus terkunci di dalam dialog, Escape membatalkan, latar tidak bisa diinteraksi, fokus kembali ke pemicu saat ditutup.
// Fokus awal ada di "Batal" (aksi aman) agar tidak terhapus karena Enter yang tidak disengaja.
// Dipasang hanya saat `open` (mount-on-open) sehingga tidak ada listener/timer tersisa saat tertutup.
export function ConfirmDialog({
  open, title, description, confirmLabel, cancelLabel = "Batal", danger = true, busy = false, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return <Inner title={title} description={description} confirmLabel={confirmLabel} cancelLabel={cancelLabel} danger={danger} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />;
}

function Inner({
  title, description, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel,
}: Omit<Parameters<typeof ConfirmDialog>[0], "open">) {
  const ref = useRef<HTMLDialogElement>(null);
  const outcome = useRef<"confirm" | "cancel">("cancel"); // Escape/klik latar = cancel
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  // Semua jalur penutupan melewati dialog.close() SEBELUM komponen dilepas, sehingga browser mengembalikan fokus ke pemicu.
  const finish = (result: "confirm" | "cancel") => {
    outcome.current = result;
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className="rona-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={() => (outcome.current === "confirm" ? onConfirm() : onCancel())} // juga dipicu Escape (bawaan browser)
      onClick={(e: MouseEvent<HTMLDialogElement>) => { if (e.target === e.currentTarget && !busy) finish("cancel"); }}
    >
      <div className="rona-dialog-body">
        <h2 id={titleId} className="rona-dialog-title">{title}</h2>
        {description ? <p id={descId} className="rona-dialog-text">{description}</p> : null}
        <div className="rona-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => finish("cancel")} autoFocus disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={() => finish("confirm")} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
