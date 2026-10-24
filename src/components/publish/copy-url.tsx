"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { buildPublicUrl } from "@/lib/publish/state";

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

/**
 * Menampilkan URL publik + tombol Buka + Salin. URL dibentuk dari origin tepercaya server bila ada, selain itu dari origin peramban (benar untuk localhost, preview, produksi).
 * Bila Clipboard API tidak tersedia/ditolak: coba execCommand("copy") pada kolom yang dipilih; bila masih gagal, kolom tetap
 * terpilih dan pengguna diminta menyalin manual (Ctrl/Cmd+C atau tekan lama).
 */
export function CopyUrl({ username, baseUrl }: { username: string; baseUrl?: string | null }) {
  const browserOrigin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  // Bila server memberi origin tepercaya (NEXT_PUBLIC_SITE_URL), pakai itu; origin peramban hanya cadangan.
  const origin = baseUrl || browserOrigin;
  const url = origin ? buildPublicUrl(origin, username) : null;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function copy() {
    if (!url) return;
    setMessage(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage("URL disalin.");
        return;
      }
    } catch {
      /* lanjut ke cara alternatif */
    }
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
      try {
        if (document.execCommand("copy")) {
          setMessage("URL disalin.");
          return;
        }
      } catch {
        /* abaikan */
      }
    }
    setMessage("Tidak dapat menyalin otomatis. URL sudah terpilih — salin dengan Ctrl/Cmd+C atau tekan lama.");
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="field-label">Alamat halaman publik</label>
      <input
        id={inputId}
        ref={inputRef}
        className="field-input"
        readOnly
        value={url ?? `/${username}`}
        onFocus={() => inputRef.current?.select()}
      />
      <div className="flex flex-wrap gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
            Buka halaman publik
          </a>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy} disabled={!url}>
          Salin URL
        </button>
      </div>
      <p className="field-hint" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
