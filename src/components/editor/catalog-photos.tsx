"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteCatalogPhotoAction, reorderCatalogPhotosAction, setCatalogCoverAction, uploadCatalogPhotoAction,
} from "@/app/dashboard/editor/catalog-actions";
import { FULL_MAX_PX, THUMB_MAX_BYTES, THUMB_PX, fitWithin, planPhotoBatch } from "@/lib/catalog/images";
import { MAX_PHOTOS_PER_ITEM } from "@/lib/catalog/item";
import type { EditorPhoto } from "@/lib/catalog/state";
import { checkImageMeta, computeCrop, MAX_UPLOAD_BYTES } from "@/lib/editor/upload";

// Foto item katalog (maks 7). Alur: pilih file -> DIKOMPRES di browser (foto penuh <=1600px + thumbnail persegi 640px,
// WebP/JPEG) -> pratinjau hasilnya -> "Unggah" -> server memeriksa ulang isi file & kepemilikan -> bucket draft PRIVAT.
// File yang sudah tersimpan tidak pernah diunggah ulang saat pemilik hanya mengedit teks item (komponen ini terpisah dari
// penyimpanan teks). Server Action tidak menyediakan persentase progres: indikator yang ditampilkan "Mengunggah n/total".

type Staged = { key: string; previewUrl: string; full: Blob; thumb: Blob; width: number; height: number; name: string };

type Props = {
  itemId: string;
  photos: EditorPhoto[];
  coverId: string | null;
  disabled?: boolean;
  onAdded: (photo: EditorPhoto, coverId: string | null) => void;
  onChange: (photos: EditorPhoto[], coverId: string | null) => void;
  onPersist: () => void;
  onSignedOut: () => void;
};

function loadImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

async function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (webp && webp.type === "image/webp") return webp;
  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality + 0.04)); // peramban lama
}

async function processFile(file: File): Promise<Staged> {
  const { img, url } = await loadImage(file);
  try {
    if (img.naturalWidth < 64 || img.naturalHeight < 64) throw new Error("small");
    const size = fitWithin(img.naturalWidth, img.naturalHeight, FULL_MAX_PX);
    const full = document.createElement("canvas");
    full.width = size.width;
    full.height = size.height;
    const fctx = full.getContext("2d");
    if (!fctx) throw new Error("canvas");
    fctx.imageSmoothingQuality = "high";
    fctx.drawImage(img, 0, 0, size.width, size.height);

    const side = Math.min(THUMB_PX, Math.min(img.naturalWidth, img.naturalHeight));
    const crop = computeCrop(img.naturalWidth, img.naturalHeight, 1);
    const thumb = document.createElement("canvas");
    thumb.width = side;
    thumb.height = side;
    const tctx = thumb.getContext("2d");
    if (!tctx) throw new Error("canvas");
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, side, side);

    const fullBlob = await toBlob(full, 0.82);
    let thumbBlob = await toBlob(thumb, 0.8);
    if (!fullBlob || !thumbBlob) throw new Error("blob");
    if (thumbBlob.size > THUMB_MAX_BYTES) thumbBlob = (await toBlob(thumb, 0.6)) ?? thumbBlob;
    if (fullBlob.size > MAX_UPLOAD_BYTES) throw new Error("big");
    return {
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      previewUrl: URL.createObjectURL(thumbBlob), full: fullBlob, thumb: thumbBlob, width: size.width, height: size.height, name: file.name,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CatalogPhotos({ itemId, photos, coverId, disabled, onAdded, onChange, onPersist, onSignedOut }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const stagedRef = useRef<Staged[]>([]);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [phase, setPhase] = useState<"idle" | "processing" | "uploading">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const photosRef = useRef(photos);
  const coverRef = useRef(coverId);

  useEffect(() => {
    photosRef.current = photos;
    coverRef.current = coverId;
  }, [photos, coverId]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(() => () => stagedRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl)), []);

  const room = MAX_PHOTOS_PER_ITEM - photos.length - staged.length;

  async function onPick(files: FileList | null) {
    setMessage(null);
    if (!files || files.length === 0 || busy.current) return;
    const picked = Array.from(files);
    const plan = planPhotoBatch(photos.length + staged.length, picked.length);
    const accepted = picked.slice(0, plan.accept);
    if (plan.rejected > 0) {
      setMessage({ kind: "info", text: plan.full ? "Sudah 7 foto (maksimal)." : `Hanya ${plan.accept} foto yang muat (maksimal 7 per item); sisanya diabaikan.` });
    }
    busy.current = true;
    setPhase("processing");
    const next: Staged[] = [];
    const problems: string[] = [];
    for (const file of accepted) {
      const meta = checkImageMeta(file);
      if (!meta.ok) { problems.push(`${file.name}: ${meta.message}`); continue; }
      try {
        next.push(await processFile(file));
      } catch {
        problems.push(`${file.name}: gambar tidak dapat diproses (terlalu kecil, rusak, atau terlalu besar).`);
      }
    }
    setStaged((cur) => [...cur, ...next]);
    if (problems.length > 0) setMessage({ kind: "error", text: problems.join(" ") });
    if (inputRef.current) inputRef.current.value = "";
    busy.current = false;
    setPhase("idle");
  }

  function unstage(key: string) {
    setStaged((cur) => {
      const gone = cur.find((s) => s.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return cur.filter((s) => s.key !== key);
    });
  }

  async function uploadAll() {
    if (busy.current || stagedRef.current.length === 0) return;
    busy.current = true;
    setPhase("uploading");
    setMessage(null);
    const queue = [...stagedRef.current];
    let done = 0;
    setProgress({ done, total: queue.length });
    for (const s of queue) {
      const form = new FormData();
      form.set("itemId", itemId);
      const ext = s.full.type === "image/webp" ? "webp" : "jpg";
      form.set("file", new File([s.full], `foto.${ext}`, { type: s.full.type }));
      form.set("thumb", new File([s.thumb], `thumb.${ext}`, { type: s.thumb.type }));
      form.set("width", String(s.width));
      form.set("height", String(s.height));
      try {
        const result = await uploadCatalogPhotoAction(form);
        if (!result.ok) {
          if (result.signedOut) { busy.current = false; return onSignedOut(); }
          setMessage({ kind: "error", text: `${result.message} Foto yang belum terunggah tetap ada di daftar; coba lagi.` });
          break;
        }
        onAdded(result.photo, result.coverId);
        onPersist();
        unstage(s.key);
        done += 1;
        setProgress({ done, total: queue.length });
      } catch {
        setMessage({ kind: "error", text: "Tidak dapat terhubung ke layanan. Foto yang belum terunggah tetap ada di daftar; coba lagi." });
        break;
      }
    }
    setProgress(null);
    busy.current = false;
    setPhase("idle");
  }

  async function setCover(id: string) {
    if (working || id === coverRef.current) return;
    const before = { photos: photosRef.current, cover: coverRef.current };
    setWorking(true);
    setMessage(null);
    onChange(before.photos, id); // optimistis
    try {
      const r = await setCatalogCoverAction(itemId, id);
      if (!r.ok) {
        onChange(before.photos, before.cover);
        if (r.signedOut) return onSignedOut();
        setMessage({ kind: "error", text: r.message });
      } else onPersist();
    } catch {
      onChange(before.photos, before.cover);
      setMessage({ kind: "error", text: "Tidak dapat terhubung ke layanan. Sampul dikembalikan." });
    } finally {
      setWorking(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    if (working) return;
    const before = photosRef.current;
    const from = before.findIndex((p) => p.id === id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= before.length) return;
    const after = before.slice();
    const [item] = after.splice(from, 1);
    after.splice(to, 0, item as EditorPhoto);
    setWorking(true);
    setMessage(null);
    onChange(after, coverRef.current);
    try {
      const r = await reorderCatalogPhotosAction(itemId, after.map((p) => p.id));
      if (!r.ok) {
        onChange(before, coverRef.current);
        if (r.signedOut) return onSignedOut();
        setMessage({ kind: "error", text: `Urutan tidak tersimpan. ${r.message}` });
      } else onPersist();
    } catch {
      onChange(before, coverRef.current);
      setMessage({ kind: "error", text: "Tidak dapat terhubung ke layanan. Urutan dikembalikan." });
    } finally {
      setWorking(false);
    }
  }

  async function remove(id: string) {
    if (working) return;
    setWorking(true);
    setMessage(null);
    setConfirmId(null);
    try {
      const r = await deleteCatalogPhotoAction(itemId, id);
      if (!r.ok) {
        if (r.signedOut) return onSignedOut();
        setMessage({ kind: "error", text: r.message });
      } else {
        onChange(photosRef.current.filter((p) => p.id !== id), r.coverId);
        onPersist();
      }
    } catch {
      setMessage({ kind: "error", text: "Tidak dapat terhubung ke layanan. Foto belum dihapus." });
    } finally {
      setWorking(false);
    }
  }

  const locked = disabled || phase !== "idle";
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="field-label">Foto ({photos.length}/{MAX_PHOTOS_PER_ITEM})</legend>
      {disabled ? <p className="field-hint">Simpan item dulu untuk menambahkan foto.</p> : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Foto item">
          {photos.map((p, i) => {
            const isCover = p.id === coverId;
            return (
              <li key={p.id} className="surface space-y-2 p-2">
                <div className="relative aspect-square overflow-hidden" style={{ borderRadius: 10, background: "color-mix(in srgb, var(--rona-ink) 7%, transparent)" }}>
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbUrl} alt={`Foto ${i + 1}${isCover ? " (sampul)" : ""}`} width={160} height={160} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-sm" style={{ color: "var(--rona-fg-muted)" }}>Pratinjau tidak tersedia</span>
                  )}
                  {isCover ? <span className="badge absolute left-1 top-1">Sampul</span> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(p.id, -1)} disabled={locked || working || i === 0} aria-label={`Geser foto ${i + 1} ke kiri`}>←</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(p.id, 1)} disabled={locked || working || i === photos.length - 1} aria-label={`Geser foto ${i + 1} ke kanan`}>→</button>
                  {!isCover ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCover(p.id)} disabled={locked || working}>Jadikan sampul</button>
                  ) : null}
                  {confirmId === p.id ? (
                    <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label="Konfirmasi hapus foto">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(p.id)} disabled={working}>Ya, hapus</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>Batal</button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmId(p.id)} disabled={locked || working} aria-label={`Hapus foto ${i + 1}`}>Hapus</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {staged.length > 0 ? (
        <div className="surface space-y-2 p-3">
          <p className="text-sm font-semibold">Pratinjau sebelum diunggah ({staged.length})</p>
          <ul className="flex flex-wrap gap-2">
            {staged.map((s) => (
              <li key={s.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.previewUrl} alt={`Pratinjau ${s.name}`} width={72} height={72} className="h-[72px] w-[72px] object-cover" style={{ borderRadius: 10 }} />
                <button type="button" className="btn btn-ghost btn-sm" style={{ position: "absolute", top: -8, right: -8, minHeight: 28, padding: "0 8px" }} onClick={() => unstage(s.key)} disabled={phase === "uploading"} aria-label={`Buang ${s.name}`}>✕</button>
              </li>
            ))}
          </ul>
          <p className="field-hint">Sudah dikompres di browser (foto maks {FULL_MAX_PX}px + thumbnail). Belum ada yang diunggah.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={uploadAll} disabled={phase !== "idle"}>
            {phase === "uploading" && progress ? `Mengunggah ${Math.min(progress.done + 1, progress.total)}/${progress.total}…` : `Unggah ${staged.length} foto`}
          </button>
        </div>
      ) : null}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          id={`photo-input-${itemId}`}
          onChange={(e) => void onPick(e.target.files)}
          disabled={locked || room <= 0}
        />
        <label
          htmlFor={`photo-input-${itemId}`}
          className="btn btn-ghost btn-sm"
          aria-disabled={locked || room <= 0 ? "true" : undefined}
          style={locked || room <= 0 ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
        >
          {phase === "processing" ? "Memproses…" : room <= 0 ? "Maksimal 7 foto" : "+ Tambah foto"}
        </label>
        <p className="field-hint">JPG, PNG, atau WebP (SVG tidak didukung). Foto pertama otomatis menjadi sampul.</p>
      </div>

      {message ? (
        <p className={`notice ${message.kind === "error" ? "notice-error" : ""}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>
      ) : null}
    </fieldset>
  );
}
