"use client";

import { useRef, useState } from "react";
import { publishAction, unpublishAction } from "@/app/dashboard/editor/publish-actions";
import { CopyUrl } from "@/components/publish/copy-url";
import { describePublish, type PublishOp, type PublishState } from "@/lib/publish/state";

type Props = {
  initial: PublishState;
  username: string; // username tersimpan (bukan ketikan yang belum disimpan)
  persistTick: number; // naik setiap ada perubahan yang berhasil tersimpan (draft/tautan/urutan/gambar)
  getTick: () => number; // nilai terkini secara sinkron (untuk menandai sinkron setelah menyimpan draft)
  hasUnsavedDraft: boolean;
  hasUnsavedLinks: boolean;
  onSaveDraft: () => Promise<boolean>;
  onSignedOut: () => void;
};

const TONE_CLASS = { neutral: "badge", ok: "badge", warn: "badge", error: "badge", busy: "badge" } as const;

export function PublishPanel({ initial, username, persistTick, getTick, hasUnsavedDraft, hasUnsavedLinks, onSaveDraft, onSignedOut }: Props) {
  const [state, setState] = useState(initial);
  const [liveUsername, setLiveUsername] = useState(username);
  const [op, setOp] = useState<PublishOp>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [syncedTick, setSyncedTick] = useState(persistTick);
  const busy = useRef(false); // cegah klik ganda / proses publish bersamaan dari tab ini

  const changesPending = persistTick > syncedTick;
  const view = describePublish(state, op, changesPending);
  const working = op === "publishing" || op === "unpublishing";

  async function publish() {
    if (busy.current) return;
    setError(null);
    if (hasUnsavedLinks) {
      setError("Ada tautan atau item katalog yang belum disimpan. Simpan dulu, lalu terbitkan.");
      return;
    }
    busy.current = true;
    setOp("publishing");
    try {
      if (hasUnsavedDraft) {
        const saved = await onSaveDraft();
        if (!saved) {
          setOp("failed");
          setError("Draft belum tersimpan, jadi belum diterbitkan. Perbaiki galat pada draft lalu coba lagi.");
          return;
        }
      }
      const tickAtPublish = getTick(); // perubahan yang tersimpan SETELAH ini tetap dihitung "belum diterbitkan"
      const result = await publishAction();
      if (result.ok) {
        setState(result.state);
        setLiveUsername(result.username);
        setSyncedTick(tickAtPublish);
        setOp("published-ok");
      } else if (result.signedOut) {
        onSignedOut();
      } else {
        setOp("failed");
        setError(result.fieldErrors?.publish ?? result.message); // draft tetap utuh; versi live lama tidak berubah
      }
    } catch {
      setOp("failed");
      setError("Tidak dapat terhubung ke layanan. Draft Anda aman dan versi live tidak berubah; coba lagi.");
    } finally {
      busy.current = false;
    }
  }

  async function unpublish() {
    if (busy.current) return;
    busy.current = true;
    setConfirming(false);
    setError(null);
    setOp("unpublishing");
    try {
      const result = await unpublishAction();
      if (result.ok) {
        setState(result.state);
        setOp("unpublished-ok");
      } else if (result.signedOut) {
        onSignedOut();
      } else {
        setOp("failed");
        setError(result.message);
      }
    } catch {
      setOp("failed");
      setError("Tidak dapat terhubung ke layanan. Halaman masih berstatus terbit; coba lagi.");
    } finally {
      busy.current = false;
    }
  }

  const canPublish = !working && (!state.isPublished || view.key === "changes" || view.key === "failed");
  const publishLabel = state.isPublished ? "Terbitkan perubahan" : "Terbitkan halaman";

  return (
    <section aria-labelledby="publish-heading" className="surface space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="publish-heading" className="text-lg font-semibold">Penerbitan</h2>
        <span className={TONE_CLASS[view.tone]} role="status" aria-live="polite" data-publish-status={view.key}>
          {view.label}
        </span>
        {state.version !== null ? (
          <span className="text-sm" style={{ color: "var(--rona-fg-muted)" }}>
            versi {state.version}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="notice notice-error" role="alert" style={{ whiteSpace: "pre-line" }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={publish} disabled={!canPublish}>
          {op === "publishing" ? "Menerbitkan…" : op === "failed" ? "Coba terbitkan lagi" : publishLabel}
        </button>
        {state.isPublished && !confirming ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)} disabled={working}>
            Batalkan penerbitan
          </button>
        ) : null}
        {confirming ? (
          <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Konfirmasi batalkan penerbitan">
            <span className="text-sm font-medium">Halaman publik akan tidak dapat diakses. Lanjutkan?</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={unpublish}>Ya, batalkan penerbitan</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Batal</button>
          </span>
        ) : null}
      </div>

      {view.showLiveUrl ? <CopyUrl username={liveUsername} /> : (
        <p className="field-hint">
          Halaman belum aktif untuk pengunjung. Draft hanya terlihat oleh Anda; pengunjung baru bisa melihatnya setelah diterbitkan.
        </p>
      )}
      {view.key === "changes" ? (
        <p className="field-hint">Versi yang tampil ke pengunjung masih versi lama sampai Anda menerbitkan perubahan.</p>
      ) : null}
    </section>
  );
}
