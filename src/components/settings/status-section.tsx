"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { publishAction, unpublishAction } from "@/app/dashboard/editor/publish-actions";
import { CopyUrl } from "@/components/publish/copy-url";
import { SectionCard } from "@/components/settings/section-parts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { describePublish, type PublishOp, type PublishState } from "@/lib/publish/state";

type Props = {
  state: PublishState;
  username: string;
  siteUrl: string | null;
  dirty: boolean; // ada isian di tab lain yang belum disimpan
  onState: (next: PublishState, username: string) => void;
  onSignedOut: () => void;
  onNotify: (message: string) => void;
};

/** Memakai publishAction/unpublishAction milik Phase 4 (tidak ada fungsi publish kedua). */
export function StatusSection({ state, username, siteUrl, dirty, onState, onSignedOut, onNotify }: Props) {
  const [op, setOp] = useState<PublishOp>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);
  const view = describePublish(state, op, false);
  const working = op === "publishing" || op === "unpublishing";

  async function run(kind: "publish" | "unpublish") {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setOp(kind === "publish" ? "publishing" : "unpublishing");
    try {
      const r = kind === "publish" ? await publishAction() : await unpublishAction();
      if (r.ok) {
        onState(r.state, r.username);
        setOp(kind === "publish" ? "published-ok" : "unpublished-ok");
        onNotify(kind === "publish" ? "Halaman diterbitkan." : "Penerbitan dibatalkan. Draft tetap tersimpan.");
      } else if (r.signedOut) {
        onSignedOut();
      } else {
        setOp("failed");
        setError(r.fieldErrors?.publish ?? r.message);
      }
    } catch {
      setOp("failed");
      setError("Tidak dapat terhubung ke layanan. Status halaman tidak berubah; coba lagi.");
    } finally {
      busy.current = false;
    }
  }

  const canPublish = !working && !dirty && (!state.isPublished || view.key === "changes" || view.key === "failed");

  return (
    <div className="space-y-5">
      <SectionCard id="st" title="Status halaman" description="Apakah halamanmu bisa dibuka pengunjung dan apakah ada perubahan yang belum terbit.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt style={{ color: "var(--rona-fg-muted)" }}>Status</dt>
            <dd className="font-medium" role="status" aria-live="polite" data-publish-status={view.key}>{view.label}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--rona-fg-muted)" }}>Pernah diterbitkan</dt>
            <dd className="font-medium">{state.version !== null ? `Ya (versi ${state.version})` : "Belum pernah"}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--rona-fg-muted)" }}>Perubahan belum terbit</dt>
            <dd className="font-medium">{!state.isPublished && state.version === null ? "Belum diterbitkan" : state.hasChanges ? "Ada" : "Tidak ada"}</dd>
          </div>
        </dl>
        {error ? <p className="notice notice-error" role="alert" style={{ whiteSpace: "pre-line" }}>{error}</p> : null}
        {dirty ? <p className="notice" role="note">Ada isian di tab lain yang belum disimpan. Simpan dulu sebelum menerbitkan.</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={!canPublish} onClick={() => void run("publish")}>
            {op === "publishing" ? "Menerbitkan…" : state.isPublished ? "Terbitkan perubahan" : "Terbitkan halaman"}
          </button>
          {state.isPublished ? (
            <button type="button" className="btn btn-danger" disabled={working} onClick={() => setConfirming(true)}>
              {op === "unpublishing" ? "Memproses…" : "Batalkan penerbitan"}
            </button>
          ) : null}
          <Link href="/dashboard/editor" className="btn btn-ghost">Kembali ke editor</Link>
        </div>
      </SectionCard>

      <SectionCard id="st-url" title="Alamat publik" description={view.showLiveUrl ? "Halamanmu aktif di alamat ini." : "Tautan belum aktif karena halaman belum terbit."}>
        {view.showLiveUrl ? <CopyUrl username={username} baseUrl={siteUrl} /> : <p className="field-hint">Draft tidak pernah bisa dibuka publik. Terbitkan halaman untuk mengaktifkan alamatnya.</p>}
      </SectionCard>

      <ConfirmDialog
        open={confirming}
        title="Batalkan penerbitan?"
        description="Halaman publik langsung tidak bisa diakses (menampilkan “tidak ditemukan”). Draft dan semua isinya tetap tersimpan."
        confirmLabel="Ya, batalkan penerbitan"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); void run("unpublish"); }}
      />
    </div>
  );
}
