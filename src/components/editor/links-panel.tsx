"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { LinkCard } from "@/components/editor/link-card";
import type { EditorLink, LinkFields } from "@/lib/editor/state";
import { MAX_LINKS_PER_PAGE } from "@/lib/validation/link";

type Props = {
  links: EditorLink[];
  busy: boolean;
  onAdd: () => void;
  onEdit: (id: string, patch: Partial<LinkFields>) => void;
  onSave: (id: string) => void;
  onDiscard: (id: string) => void;
  onToggle: (id: string, value: boolean) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDelete: (id: string) => void;
  onImage: (id: string, next: { path: string | null; url: string | null }) => void;
  onSignedOut: () => void;
};

export function LinksPanel({ links, busy, onAdd, onEdit, onSave, onDiscard, onToggle, onMove, onDelete, onImage, onSignedOut }: Props) {
  const full = links.length >= MAX_LINKS_PER_PAGE;
  return (
    <div className="space-y-4">
      {links.length === 0 ? (
        <EmptyState title="Belum ada tautan">
          Tambahkan tautan pertamamu — mis. situs, WhatsApp, atau katalog. Tautan baru tampil di pratinjau setelah judul dan URL valid.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {links.map((link, i) => (
            <LinkCard
              key={link.id}
              link={link}
              index={i}
              total={links.length}
              busy={busy}
              onEdit={(patch) => onEdit(link.id, patch)}
              onSave={() => onSave(link.id)}
              onDiscard={() => onDiscard(link.id)}
              onToggle={(v) => onToggle(link.id, v)}
              onMove={(d) => onMove(link.id, d)}
              onDelete={() => onDelete(link.id)}
              onImage={(next) => onImage(link.id, next)}
              onSignedOut={onSignedOut}
            />
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-primary" onClick={onAdd} disabled={full}>
        + Tambah tautan
      </button>
      {full ? <p className="field-hint">Batas {MAX_LINKS_PER_PAGE} tautan tercapai.</p> : null}
    </div>
  );
}
