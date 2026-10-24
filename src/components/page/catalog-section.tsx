"use client";

import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { RADIUS, cardStyle } from "@/components/page/card-style";
import { createSlideshow, galleryReducer, initGallery } from "@/lib/catalog/gallery";
import type { CatalogView, CatalogViewItem } from "@/lib/catalog/view";
import type { PageSettings } from "@/lib/editor/settings";

// Section katalog di halaman publik dan preview editor (satu komponen, data identik bentuknya).
// - Grid kartu 1:1 yang responsif (container query, jadi benar juga di dalam bingkai preview ponsel).
// - Hanya THUMBNAIL yang dimuat untuk grid (lazy). Foto penuh dimuat HANYA saat detail dibuka, satu per satu.
// - Detail memakai elemen <dialog> native (showModal): fokus terkunci, Escape menutup, fokus kembali ke kartu,
//   latar tidak dapat diinteraksi. Rute/URL halaman tidak berubah.
// - mode="preview": tombol CTA tidak dapat diklik (tidak membuka halaman lain dari editor).

const SAFE_CTA = /^(https:\/\/|mailto:|tel:)/i;

export function CatalogSection({ catalog, settings, mode }: { catalog: CatalogView; settings: PageSettings; mode: "preview" | "live" }) {
  const headingId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const current = openIndex === null ? null : (catalog.items[openIndex] ?? null);

  return (
    <section aria-labelledby={headingId} className="rona-cat" style={{ color: settings.textColor }}>
      <h2 id={headingId} className="rona-cat-title">
        {catalog.title}
      </h2>
      <ul className="rona-cat-grid">
        {catalog.items.map((item, idx) => {
          const cover = item.images[item.coverIndex] ?? item.images[0];
          return (
            <li key={item.id} className="rona-cat-cell">
              <button
                type="button"
                className="rona-cat-card"
                style={cardStyle(settings)}
                aria-haspopup="dialog"
                onClick={() => setOpenIndex(idx)}
              >
                <span className="rona-cat-cover" style={{ borderRadius: `calc(${RADIUS[settings.radius]} - 6px)` }}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.thumbUrl} alt="" width={640} height={640} loading="lazy" decoding="async" />
                  ) : (
                    <span aria-hidden="true" className="rona-cat-ph" style={{ background: `color-mix(in srgb, ${settings.accentColor} 30%, transparent)` }}>
                      {Array.from(item.title)[0]?.toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="rona-cat-meta">
                  <span className="rona-cat-name">{item.title}</span>
                  {item.summary ? <span className="rona-cat-sum">{item.summary}</span> : null}
                  {item.price ? <span className="rona-cat-price">{item.price}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {current ? (
        // key: dialog dibuat ulang per item, sehingga galeri & timer slideshow selalu mulai bersih
        <CatalogDialog key={current.id} item={current} settings={settings} mode={mode} onClose={() => setOpenIndex(null)} />
      ) : null}
    </section>
  );
}

export function CatalogDialog({ item, settings, mode, onClose }: { item: CatalogViewItem; settings: PageSettings; mode: "preview" | "live"; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const n = item.images.length;
  const [g, dispatch] = useReducer(galleryReducer, undefined, () =>
    initGallery(n, item.coverIndex, typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );

  // Buka sebagai modal native; kunci scroll halaman selama terbuka. Cleanup memulihkan keadaan saat ditutup/dilepas.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
      if (dialog.open) dialog.close();
    };
  }, []);

  // Slideshow ~2 detik: hanya berjalan saat `playing`; dibersihkan saat dijeda, ditutup, atau komponen dilepas.
  useEffect(() => {
    if (!g.playing) return;
    const show = createSlideshow({
      onTick: () => dispatch({ type: "tick" }),
      timers: { set: (fn, ms) => window.setInterval(fn, ms), clear: (h) => window.clearInterval(h) },
    });
    show.start();
    return () => show.stop();
  }, [g.playing]);

  // Tab di latar belakang: jeda agar tidak membuang baterai.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Pramuat HANYA foto berikutnya (bukan seluruh galeri).
  useEffect(() => {
    if (n < 2) return;
    const next = item.images[(g.index + 1) % n];
    if (next) new Image().src = next.url;
  }, [g.index, n, item.images]);

  const img = item.images[g.index];
  const cta = item.cta && SAFE_CTA.test(item.cta.href) ? item.cta : null;
  const ctaStyle = {
    background: settings.textColor, color: settings.backgroundColor, borderRadius: RADIUS[settings.radius],
  } as const;

  return (
    <dialog
      ref={ref}
      className="rona-cat-dialog"
      aria-labelledby={titleId}
      style={{ background: settings.backgroundColor, color: settings.textColor, borderRadius: `min(${RADIUS[settings.radius]}, 28px)` }}
      onClose={onClose}
      onClick={(e: MouseEvent<HTMLDialogElement>) => {
        if (e.target === e.currentTarget) e.currentTarget.close(); // klik di luar panel
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDialogElement>) => {
        if (n < 2) return;
        if (e.key === "ArrowRight") dispatch({ type: "next" });
        else if (e.key === "ArrowLeft") dispatch({ type: "prev" });
      }}
    >
      <div className="rona-cat-detail">
        <button type="button" className="rona-cat-close" onClick={() => ref.current?.close()} aria-label="Tutup detail" style={{ color: settings.textColor }}>
          <span aria-hidden="true">✕</span> <span>Tutup</span>
        </button>

        <div className="rona-cat-gallery" role="group" aria-roledescription="carousel" aria-label={`Foto ${item.title}`}>
          <div className="rona-cat-stage" aria-live={g.playing ? "off" : "polite"}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={g.index} className="rona-cat-photo" src={img.url} alt={`${item.title} — foto ${g.index + 1} dari ${n}`} decoding="async" />
            ) : (
              <div className="rona-cat-nophoto" aria-hidden="true">{Array.from(item.title)[0]?.toUpperCase()}</div>
            )}
            {n > 1 ? (
              <>
                <button type="button" className="rona-cat-nav rona-cat-prev" onClick={() => dispatch({ type: "prev" })} aria-label="Foto sebelumnya">‹</button>
                <button type="button" className="rona-cat-nav rona-cat-next" onClick={() => dispatch({ type: "next" })} aria-label="Foto berikutnya">›</button>
              </>
            ) : null}
          </div>
          {n > 1 ? (
            <div className="rona-cat-bar">
              <button type="button" className="rona-cat-pp" aria-pressed={g.playing} onClick={() => dispatch({ type: "toggle" })}>
                {g.playing ? "⏸ Jeda" : "▶ Putar"}
              </button>
              <span className="rona-cat-count" aria-hidden="true">{g.index + 1} / {n}</span>
              <div className="rona-cat-dots">
                {item.images.map((im, i) => (
                  <button
                    key={i}
                    type="button"
                    className="rona-cat-dot"
                    aria-label={`Foto ${i + 1}`}
                    aria-current={i === g.index ? "true" : undefined}
                    onClick={() => dispatch({ type: "goto", index: i })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.thumbUrl} alt="" width={56} height={56} loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rona-cat-info">
          <h3 id={titleId} className="rona-cat-h">{item.title}</h3>
          {item.price ? <p className="rona-cat-dprice">{item.price}</p> : null}
          {item.description ? <p className="rona-cat-desc">{item.description}</p> : item.summary ? <p className="rona-cat-desc">{item.summary}</p> : null}
          {cta ? (
            mode === "live" ? (
              <a
                className="rona-cat-cta"
                style={ctaStyle}
                href={cta.href}
                {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {cta.label}
              </a>
            ) : (
              <span className="rona-cat-cta" style={{ ...ctaStyle, opacity: 0.85 }} aria-disabled="true" title="Aktif di halaman publik">
                {cta.label}
              </span>
            )
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
