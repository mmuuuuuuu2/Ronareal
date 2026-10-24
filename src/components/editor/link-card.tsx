"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageField } from "@/components/editor/image-field";
import { LinkIcon } from "@/components/page/link-icon";
import { TextField } from "@/components/ui/text-field";
import { LINK_ICON_KEYS, LINK_ICON_LABELS, type LinkIconKey } from "@/lib/editor/icons";
import { isLinkDirty, isNewLink, type EditorLink, type LinkFields } from "@/lib/editor/state";
import { LINK_DESCRIPTION_MAX, LINK_TITLE_MAX } from "@/lib/validation/link";

type Props = {
  link: EditorLink;
  index: number;
  total: number;
  busy: boolean; // ada operasi urutan yang sedang berjalan
  onEdit: (patch: Partial<LinkFields>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onToggle: (value: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onImage: (next: { path: string | null; url: string | null }) => void;
  onSignedOut: () => void;
};

export function LinkCard({ link, index, total, busy, onEdit, onSave, onDiscard, onToggle, onMove, onDelete, onImage, onSignedOut }: Props) {
  const [open, setOpen] = useState(isNewLink(link));
  const [confirming, setConfirming] = useState(false);
  const dirty = isLinkDirty(link);
  const saving = link.status === "saving";
  const fe = link.fieldErrors ?? {};
  const base = `link-${link.id.replace(/[^a-z0-9-]/gi, "")}`;

  return (
    <li className="surface p-3 sm:p-4" aria-label={`Tautan ${index + 1}: ${link.title || "tanpa judul"}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex-none opacity-70">
          {link.icon ? <LinkIcon name={link.icon} /> : <LinkIcon name="link" />}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          aria-controls={`${base}-panel`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="block truncate font-semibold">{link.title || "Tautan baru"}</span>
          <span className="block truncate text-sm" style={{ color: "var(--rona-fg-muted)" }}>
            {link.url || "Belum ada URL"}
          </span>
        </button>
        {!link.isVisible ? <span className="badge">Disembunyikan</span> : null}
        {dirty ? <span className="badge" title="Belum disimpan">Belum disimpan</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(-1)} disabled={index === 0 || busy} aria-label={`Naikkan ${link.title || "tautan"}`}>
          ↑ Naik
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(1)} disabled={index === total - 1 || busy} aria-label={`Turunkan ${link.title || "tautan"}`}>
          ↓ Turun
        </button>
        <label className="ml-auto inline-flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={link.isVisible} onChange={(e) => onToggle(e.target.checked)} />
          Tampilkan
        </label>
      </div>

      {open ? (
        <div id={`${base}-panel`} className="mt-4 space-y-4">
          <TextField
            id={`${base}-title`}
            label="Judul"
            value={link.title}
            maxLength={LINK_TITLE_MAX}
            onChange={(e) => onEdit({ title: e.target.value })}
            error={fe.title}
            autoComplete="off"
          />
          <TextField
            id={`${base}-url`}
            label="URL tujuan"
            type="text"
            inputMode="url"
            value={link.url}
            onChange={(e) => onEdit({ url: e.target.value })}
            error={fe.url}
            hint="https://contoh.com, mailto:nama@contoh.com, atau tel:+62…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <div>
            <label htmlFor={`${base}-desc`} className="field-label">Deskripsi singkat (opsional)</label>
            <textarea
              id={`${base}-desc`}
              className="field-textarea"
              style={{ minHeight: "4.5rem" }}
              rows={2}
              maxLength={LINK_DESCRIPTION_MAX}
              value={link.description}
              onChange={(e) => onEdit({ description: e.target.value })}
              aria-invalid={fe.description ? true : undefined}
            />
            {fe.description ? <p className="field-error" role="alert">{fe.description}</p> : null}
          </div>

          <fieldset>
            <legend className="field-label">Ikon (opsional)</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="seg-btn" aria-pressed={link.icon === null} onClick={() => onEdit({ icon: null })}>
                Tanpa ikon
              </button>
              {LINK_ICON_KEYS.map((key: LinkIconKey) => (
                <button
                  key={key}
                  type="button"
                  className="seg-btn"
                  aria-pressed={link.icon === key}
                  aria-label={LINK_ICON_LABELS[key]}
                  title={LINK_ICON_LABELS[key]}
                  onClick={() => onEdit({ icon: key })}
                  style={{ padding: "0 0.65rem" }}
                >
                  <LinkIcon name={key} size={18} />
                </button>
              ))}
            </div>
          </fieldset>

          <ImageField
            kind="link"
            label="Gambar tautan (opsional)"
            hint="Menggantikan ikon bila ada."
            currentUrl={link.imageUrl}
            {...(isNewLink(link) ? {} : { linkId: link.id })}
            disabled={isNewLink(link)}
            disabledReason="Simpan tautan dulu untuk menambahkan gambar."
            onChanged={onImage}
            onSignedOut={onSignedOut}
          />

          {link.error ? (
            <p className="notice notice-error" role="alert">
              {link.error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || (!dirty && link.status !== "error")}>
              {saving ? "Menyimpan…" : link.status === "error" ? "Coba simpan lagi" : "Simpan tautan"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscard} disabled={saving || !dirty}>
              {isNewLink(link) ? "Buang" : "Batalkan perubahan"}
            </button>
            <button type="button" className="btn btn-danger btn-sm ml-auto" onClick={() => setConfirming(true)} disabled={saving}>
              Hapus
            </button>
            <ConfirmDialog
              open={confirming}
              title="Hapus tautan ini?"
              description={`“${link.title || "Tautan tanpa judul"}” beserta gambarnya akan dihapus dari draft. Halaman yang sudah terbit tidak berubah sampai Anda menerbitkan ulang.`}
              confirmLabel="Ya, hapus"
              onCancel={() => setConfirming(false)}
              onConfirm={() => { setConfirming(false); onDelete(); }}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
