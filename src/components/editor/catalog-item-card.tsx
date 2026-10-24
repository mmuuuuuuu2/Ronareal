"use client";

import { useState } from "react";
import { CatalogPhotos } from "@/components/editor/catalog-photos";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/text-field";
import {
  CTA_LABEL_MAX, CTA_LABEL_SUGGESTIONS, CTA_MESSAGE_MAX, CTA_TYPES, CTA_TYPE_LABELS, DEFAULT_CTA_LABEL, DEFAULT_WA_TEMPLATE, isCtaType,
} from "@/lib/catalog/cta";
import { LIMITS, PRICE_LABEL_SUGGESTIONS, type ItemFields } from "@/lib/catalog/item";
import { isItemDirty, isNewItem, type EditorCatalogItem, type EditorPhoto } from "@/lib/catalog/state";

type Props = {
  item: EditorCatalogItem;
  index: number;
  total: number;
  busy: boolean;
  onEdit: (patch: Partial<ItemFields>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onToggle: (value: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onPhotoAdded: (photo: EditorPhoto, coverId: string | null) => void;
  onPhotosChange: (photos: EditorPhoto[], coverId: string | null) => void;
  onPersist: () => void;
  onSignedOut: () => void;
};

const VALUE_PLACEHOLDER = {
  whatsapp: "0812 3456 7890 atau +62 812 3456 7890",
  url: "https://contoh.com/pesan",
  email: "halo@contoh.com",
  phone: "+62 21 555 1234",
} as const;

export function CatalogItemCard(p: Props) {
  const { item } = p;
  const [open, setOpen] = useState(isNewItem(item));
  const [confirming, setConfirming] = useState(false);
  const f = item.fields;
  const dirty = isItemDirty(item);
  const saving = item.status === "saving";
  const fe = item.fieldErrors ?? {};
  const base = `cat-${item.id.replace(/[^a-z0-9-]/gi, "")}`;
  const ctaType = isCtaType(f.ctaType) ? f.ctaType : null;
  const set = (patch: Partial<ItemFields>) => p.onEdit(patch);

  return (
    <li className="surface p-3 sm:p-4" aria-label={`Item ${p.index + 1}: ${f.title || "tanpa judul"}`}>
      <div className="flex items-center gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open} aria-controls={`${base}-panel`} onClick={() => setOpen((v) => !v)}>
          <span className="block truncate font-semibold">{f.title || "Item baru"}</span>
          <span className="block truncate text-sm" style={{ color: "var(--rona-fg-muted)" }}>
            {item.photos.length} foto{ctaType ? ` · ${CTA_TYPE_LABELS[ctaType]}` : ""}
          </span>
        </button>
        {!item.isVisible ? <span className="badge">Draft (tidak tampil)</span> : null}
        {dirty ? <span className="badge" title="Belum disimpan">Belum disimpan</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onMove(-1)} disabled={p.index === 0 || p.busy || isNewItem(item)} aria-label={`Naikkan ${f.title || "item"}`}>↑ Naik</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onMove(1)} disabled={p.index === p.total - 1 || p.busy || isNewItem(item)} aria-label={`Turunkan ${f.title || "item"}`}>↓ Turun</button>
        <label className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={item.isVisible} onChange={(e) => p.onToggle(e.target.checked)} disabled={saving} />
          Tampilkan di halaman
        </label>
      </div>

      {open ? (
        <div id={`${base}-panel`} className="mt-4 space-y-4">
          <TextField id={`${base}-title`} label="Judul" value={f.title} maxLength={LIMITS.title * 2} onChange={(e) => set({ title: e.target.value })} error={fe.title} autoComplete="off" required />
          <TextField id={`${base}-summary`} label="Deskripsi singkat" value={f.summary} onChange={(e) => set({ summary: e.target.value })} error={fe.summary}
            hint={`Tampil di kartu. ${Array.from(f.summary).length}/${LIMITS.summary}`} autoComplete="off" />
          <div>
            <label htmlFor={`${base}-desc`} className="field-label">Deskripsi lengkap</label>
            <textarea id={`${base}-desc`} className="field-input" style={{ minHeight: "7rem", padding: "0.6rem 0.875rem" }} value={f.description}
              onChange={(e) => set({ description: e.target.value })} aria-invalid={fe.description ? true : undefined} aria-describedby={`${base}-desc-h`} />
            <p id={`${base}-desc-h`} className={fe.description ? "field-error" : "field-hint"}>{fe.description ?? `Tampil di detail. ${Array.from(f.description).length}/${LIMITS.description}`}</p>
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="field-label">Harga (opsional)</legend>
            <TextField id={`${base}-price`} label="Nominal (Rp)" inputMode="numeric" value={f.priceAmount} onChange={(e) => set({ priceAmount: e.target.value })} error={fe.priceAmount} hint="Angka bulat, mis. 1500000" autoComplete="off" />
            <div>
              <TextField id={`${base}-plabel`} label="Label harga" value={f.priceLabel} onChange={(e) => set({ priceLabel: e.target.value })} error={fe.priceLabel} autoComplete="off" />
              <div className="mt-2 flex flex-wrap gap-1">
                {PRICE_LABEL_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => set({ priceLabel: s })}>{s}</button>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="field-label">Tombol (CTA)</legend>
            <div>
              <label htmlFor={`${base}-ctatype`} className="field-label">Tujuan</label>
              <select id={`${base}-ctatype`} className="field-input" value={f.ctaType} onChange={(e) => set({ ctaType: isCtaType(e.target.value) ? e.target.value : "" })}>
                <option value="">Tanpa tombol</option>
                {CTA_TYPES.map((t) => <option key={t} value={t}>{CTA_TYPE_LABELS[t]}</option>)}
              </select>
              {fe.ctaType ? <p className="field-error" role="alert">{fe.ctaType}</p> : null}
            </div>
            {ctaType ? (
              <>
                <TextField id={`${base}-ctaval`} label={ctaType === "whatsapp" ? "Nomor WhatsApp" : ctaType === "url" ? "Alamat https" : ctaType === "email" ? "Alamat email" : "Nomor telepon"}
                  value={f.ctaValue} onChange={(e) => set({ ctaValue: e.target.value })} error={fe.ctaValue} placeholder={VALUE_PLACEHOLDER[ctaType]}
                  inputMode={ctaType === "whatsapp" || ctaType === "phone" ? "tel" : ctaType === "email" ? "email" : "url"} autoComplete="off"
                  hint={ctaType === "whatsapp" ? "Awalan 0 dibaca sebagai Indonesia (+62)." : ctaType === "url" ? "Hanya https." : undefined} />
                <div>
                  <TextField id={`${base}-ctalabel`} label="Label tombol" value={f.ctaLabel} maxLength={CTA_LABEL_MAX * 2} onChange={(e) => set({ ctaLabel: e.target.value })} error={fe.ctaLabel}
                    placeholder={DEFAULT_CTA_LABEL[ctaType]} hint="Kosong = memakai label bawaan." autoComplete="off" />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {CTA_LABEL_SUGGESTIONS.map((s) => (
                      <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => set({ ctaLabel: s })}>{s}</button>
                    ))}
                  </div>
                </div>
                {ctaType === "whatsapp" ? (
                  <div>
                    <label htmlFor={`${base}-ctamsg`} className="field-label">Template pesan WhatsApp</label>
                    <textarea id={`${base}-ctamsg`} className="field-input" style={{ minHeight: "5.5rem", padding: "0.6rem 0.875rem" }} value={f.ctaMessage} maxLength={CTA_MESSAGE_MAX * 2}
                      placeholder={DEFAULT_WA_TEMPLATE} onChange={(e) => set({ ctaMessage: e.target.value })} aria-invalid={fe.ctaMessage ? true : undefined} />
                    <p className={fe.ctaMessage ? "field-error" : "field-hint"}>
                      {fe.ctaMessage ?? "Placeholder: {judul} {username} {nama}. Pengunjung hanya diarahkan ke WhatsApp dengan teks terisi; pesan tidak dikirim otomatis. Kosong = template bawaan."}
                    </p>
                    <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => set({ ctaMessage: DEFAULT_WA_TEMPLATE })}>Pakai template bawaan</button>
                  </div>
                ) : null}
              </>
            ) : null}
          </fieldset>

          <CatalogPhotos
            itemId={item.id}
            photos={item.photos}
            coverId={item.coverId}
            disabled={isNewItem(item)}
            onAdded={p.onPhotoAdded}
            onChange={p.onPhotosChange}
            onPersist={p.onPersist}
            onSignedOut={p.onSignedOut}
          />

          {item.error ? <p className="notice notice-error" role="alert">{item.error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={p.onSave} disabled={saving || (!dirty && item.status !== "error")}>
              {saving ? "Menyimpan…" : item.status === "error" ? "Coba simpan lagi" : "Simpan item"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={p.onDiscard} disabled={saving || !dirty}>
              {isNewItem(item) ? "Buang" : "Batalkan perubahan"}
            </button>
            <button type="button" className="btn btn-danger btn-sm ml-auto" onClick={() => setConfirming(true)} disabled={saving}>Hapus</button>
            <ConfirmDialog
              open={confirming}
              title="Hapus item ini?"
              description={`“${f.title || "Item tanpa judul"}” beserta semua fotonya akan dihapus dari draft. Halaman yang sudah terbit tidak berubah sampai Anda menerbitkan ulang.`}
              confirmLabel="Ya, hapus"
              onCancel={() => setConfirming(false)}
              onConfirm={() => { setConfirming(false); p.onDelete(); }}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
