"use client";

import { useEffect, useRef, useState } from "react";
import { uploadImageAction, removeImageAction } from "@/app/dashboard/editor/actions";
import { checkImageMeta, computeCrop, MAX_UPLOAD_BYTES, OUTPUT_SPEC, type AssetKind } from "@/lib/editor/upload";

// Pilih gambar -> pratinjau crop (zoom + titik fokus) -> dipotong & dikompres di browser (canvas) -> unggah lewat
// server action (server memvalidasi ulang). Tidak ada unggahan otomatis saat render; satu unggahan pada satu waktu.
// Server Action tidak menyediakan persentase progres, jadi status yang ditampilkan adalah "Mengunggah…" (indeterminate).

type Props = {
  kind: AssetKind;
  label: string;
  hint?: string;
  currentUrl: string | null;
  linkId?: string; // wajib untuk kind="link"
  disabled?: boolean;
  disabledReason?: string;
  onChanged: (next: { path: string | null; url: string | null }) => void;
  onSignedOut: () => void;
};

const PREVIEW_W: Record<AssetKind, number> = { avatar: 200, background: 150, link: 220 };

export function ImageField({ kind, label, hint, currentUrl, linkId, disabled, disabledReason, onChanged, onSignedOut }: Props) {
  const spec = OUTPUT_SPEC[kind];
  const previewW = PREVIEW_W[kind];
  const previewH = Math.round(previewW / spec.aspect);

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false); // penjaga unggahan ganda (klik ganda / render ulang)
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fx, setFx] = useState(0.5);
  const [fy, setFy] = useState(0.5);
  const [phase, setPhase] = useState<"idle" | "cropping" | "uploading" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  // Gambar ulang pratinjau crop bila pengaturan berubah (hanya canvas lokal; tanpa jaringan).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const r = computeCrop(img.naturalWidth, img.naturalHeight, spec.aspect, zoom, fx, fy);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
  }, [img, zoom, fx, fy, spec.aspect]);

  function resetPicker() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setImg(null);
    setZoom(1);
    setFx(0.5);
    setFy(0.5);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPick(file: File | undefined) {
    setError(null);
    if (!file) return;
    const check = checkImageMeta(file);
    if (!check.ok) {
      setError(check.message);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth < 64 || image.naturalHeight < 64) {
        URL.revokeObjectURL(url);
        setError("Gambar terlalu kecil (minimal 64×64 piksel).");
        return;
      }
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setImg(image);
      setPhase("cropping");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("File tidak dapat dibaca sebagai gambar.");
    };
    image.src = url;
  }

  async function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
    if (webp && webp.type === "image/webp") return webp;
    return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88)); // fallback peramban lama
  }

  async function apply() {
    if (!img || busy.current) return;
    if (kind === "link" && !linkId) {
      setError("Simpan tautan terlebih dahulu sebelum menambah gambar.");
      return;
    }
    busy.current = true;
    setPhase("uploading");
    setError(null);
    try {
      const out = document.createElement("canvas");
      out.width = spec.width;
      out.height = spec.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("canvas");
      const r = computeCrop(img.naturalWidth, img.naturalHeight, spec.aspect, zoom, fx, fy);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, out.width, out.height);
      const blob = await toBlob(out);
      if (!blob) throw new Error("blob");
      if (blob.size > MAX_UPLOAD_BYTES) {
        setError("Hasil gambar masih lebih dari 5 MB. Pilih gambar yang lebih kecil.");
        setPhase("cropping");
        return;
      }
      const form = new FormData();
      form.set("kind", kind);
      if (linkId) form.set("linkId", linkId);
      form.set("file", new File([blob], `upload.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type }));
      const result = await uploadImageAction(form);
      if (!result.ok) {
        if (result.signedOut) return onSignedOut();
        setError(result.message);
        setPhase("cropping"); // pilihan crop dipertahankan agar bisa dicoba lagi
        return;
      }
      onChanged({ path: result.path, url: result.url });
      resetPicker();
      setPhase("idle");
    } catch {
      setError("Gambar belum dapat diproses atau diunggah. Coba lagi.");
      setPhase(img ? "cropping" : "idle");
    } finally {
      busy.current = false;
    }
  }

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPhase("removing");
    setError(null);
    try {
      const result = await removeImageAction(kind, linkId);
      if (!result.ok) {
        if (result.signedOut) return onSignedOut();
        setError(result.message);
      } else {
        onChanged({ path: null, url: null });
      }
    } catch {
      setError("Gambar belum dapat dihapus. Coba lagi.");
    } finally {
      busy.current = false;
      setPhase("idle");
    }
  }

  const id = `img-${kind}-${linkId ?? "x"}`;
  const working = phase === "uploading" || phase === "removing";

  return (
    <div className="space-y-3">
      <div>
        <span className="field-label">{label}</span>
        {hint ? <p className="field-hint" style={{ marginTop: 0 }}>{hint}</p> : null}
      </div>

      {currentUrl && phase !== "cropping" && phase !== "uploading" ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={`${label} saat ini`}
            width={kind === "background" ? 56 : 72}
            height={kind === "background" ? 100 : kind === "avatar" ? 72 : 54}
            style={{ objectFit: "cover", borderRadius: kind === "avatar" ? "50%" : 12 }}
          />
          <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={working || disabled}>
            {phase === "removing" ? "Menghapus…" : "Hapus gambar"}
          </button>
        </div>
      ) : null}

      {phase === "cropping" || phase === "uploading" ? (
        <div className="surface space-y-3 p-3">
          <canvas
            ref={canvasRef}
            width={previewW}
            height={previewH}
            aria-label="Pratinjau hasil potongan"
            style={{ width: previewW, maxWidth: "100%", height: "auto", borderRadius: kind === "avatar" ? "50%" : 12, background: "#ddd" }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              Perbesar
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" disabled={working} />
            </label>
            <label className="text-sm">
              Geser ←→
              <input type="range" min={0} max={1} step={0.01} value={fx} onChange={(e) => setFx(Number(e.target.value))} className="w-full" disabled={working} />
            </label>
            <label className="text-sm">
              Geser ↑↓
              <input type="range" min={0} max={1} step={0.01} value={fy} onChange={(e) => setFy(Number(e.target.value))} className="w-full" disabled={working} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2" aria-live="polite">
            <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={working}>
              {phase === "uploading" ? "Mengunggah…" : "Potong & unggah"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { resetPicker(); setPhase("idle"); setError(null); }} disabled={working}>
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || working}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <label
            htmlFor={id}
            className="btn btn-ghost btn-sm"
            aria-disabled={disabled || working}
            style={disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
          >
            {currentUrl ? "Ganti gambar" : "Pilih gambar"}
          </label>
          {disabled && disabledReason ? <p className="field-hint">{disabledReason}</p> : null}
          <p className="field-hint">JPG, PNG, atau WebP · maks. 5 MB · rasio {kind === "avatar" ? "1:1" : kind === "background" ? "9:16 (layar ponsel)" : "4:3"}.</p>
        </div>
      )}

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
