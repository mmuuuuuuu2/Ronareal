"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/lib/editor/action-types";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string; fieldErrors: Record<string, string>; conflict: boolean };

const IDLE: SaveStatus = { kind: "idle" };

/**
 * Menjalankan server action dengan status loading/sukses/galat. Satu proses per hook (klik ganda diabaikan).
 * Isian pengguna TIDAK disentuh di sini: pemanggil hanya memperbarui state-nya pada sukses, sehingga galat tidak menghapus input.
 */
export function useSaver(onSignedOut: () => void) {
  const [status, setStatus] = useState<SaveStatus>(IDLE);
  const busy = useRef(false);

  async function run<T>(
    action: () => Promise<ActionResult<T>>,
    okMessage: string,
    onOk: (result: Extract<ActionResult<T>, { ok: true }>) => void,
  ): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setStatus({ kind: "saving" });
    try {
      const result = await action();
      if (result.ok) {
        onOk(result as Extract<ActionResult<T>, { ok: true }>);
        setStatus({ kind: "ok", message: okMessage });
        return true;
      }
      if (result.signedOut) {
        onSignedOut();
        return false;
      }
      setStatus({ kind: "error", message: result.message, fieldErrors: result.fieldErrors ?? {}, conflict: result.conflict === true });
      return false;
    } catch {
      setStatus({ kind: "error", message: "Tidak dapat terhubung ke layanan. Isian Anda masih ada di layar; coba lagi.", fieldErrors: {}, conflict: false });
      return false;
    } finally {
      busy.current = false;
    }
  }

  const reset = () => setStatus(IDLE);
  const fieldError = (name: string) => (status.kind === "error" ? status.fieldErrors[name] : undefined);
  return { status, run, reset, fieldError, saving: status.kind === "saving" };
}
