import type { CSSProperties } from "react";
import { CatalogSection } from "@/components/page/catalog-section";
import { RADIUS, cardStyle } from "@/components/page/card-style";
import { LinkIcon } from "@/components/page/link-icon";
import type { PageSettings } from "@/lib/editor/settings";
import type { PageViewData, PageViewLink } from "@/lib/editor/view-data";
import { safeHref } from "@/lib/validation/url";

// Komponen tampilan halaman — SATU komponen untuk preview editor (sekarang) dan halaman publik /[username] (fase berikutnya).
// Murni presentasional: tanpa hook, tanpa state, tanpa akses data; semua data datang lewat props.
// mode="preview": tautan tidak dapat diklik (tidak membuka halaman lain dari dalam editor).
// mode="live": tautan nyata; href tetap divalidasi ulang di sini sebagai pertahanan terakhir.

const GAP: Record<PageSettings["spacing"], string> = { compact: "8px", comfortable: "12px", airy: "18px" };

function LinkBody({ link, s }: { link: PageViewLink; s: PageSettings }) {
  return (
    <>
      {link.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={link.imageUrl}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: `min(${RADIUS[s.radius]}, 14px)`, flex: "none" }}
        />
      ) : link.icon ? (
        <span style={{ flex: "none", display: "inline-flex", opacity: 0.9 }}>
          <LinkIcon name={link.icon} size={22} />
        </span>
      ) : null}
      <span style={{ minWidth: 0, flex: 1, textAlign: s.alignment === "center" ? "center" : "left" }}>
        <span style={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}>{link.title}</span>
        {s.showDescriptions && link.description ? (
          <span style={{ display: "block", fontSize: "0.85em", opacity: 0.75, marginTop: 2, overflowWrap: "anywhere" }}>
            {link.description}
          </span>
        ) : null}
      </span>
    </>
  );
}

export function PageView({ data, mode, fill = "parent" }: { data: PageViewData; mode: "preview" | "live"; fill?: "parent" | "viewport" }) {
  const s = data.settings;
  const useImage = s.backgroundMode === "image" && data.backgroundUrl;
  const centered = s.alignment === "center";
  const avatarRadius = s.avatarShape === "circle" ? "50%" : "26%";
  // Animasi kemunculan hanya di halaman publik (sekali saat dimuat). Pratinjau tidak beranimasi agar tidak berkedip saat mengetik.
  const rise = (i: number): { className?: string; style?: CSSProperties } =>
    mode === "live" ? { className: "rona-rise", style: { "--i": i } as CSSProperties } : {};

  return (
    <div
      data-page-view
      style={{
        position: "relative",
        minHeight: fill === "viewport" ? "100dvh" : "100%",
        width: "100%",
        background: s.backgroundColor,
        color: s.textColor,
        isolation: "isolate",
        fontFamily: "var(--font-sans, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)",
      }}
    >
      {useImage ? (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute", inset: 0, zIndex: -2,
              backgroundImage: `url(${JSON.stringify(data.backgroundUrl)})`,
              backgroundSize: "cover", backgroundPosition: "center",
            }}
          />
          <div
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, zIndex: -1, background: s.backgroundColor, opacity: s.backgroundOverlay / 100 }}
          />
        </>
      ) : null}

      <div
        style={{
          margin: "0 auto", maxWidth: 520, display: "flex", flexDirection: "column",
          padding: "max(44px, calc(var(--rona-safe-top, 0px) + 28px)) max(20px, var(--rona-safe-right, 0px)) 0 max(20px, var(--rona-safe-left, 0px))",
          alignItems: centered ? "center" : "flex-start", textAlign: centered ? "center" : "left",
        }}
      >
        {s.avatarShape !== "hidden" ? (
          data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.avatarUrl}
              alt={`Foto ${data.displayName}`}
              width={96}
              height={96}
              decoding="async"
              fetchPriority={mode === "live" ? "high" : undefined}
              style={{
                width: 96, height: 96, objectFit: "cover", borderRadius: avatarRadius, border: `2px solid ${s.accentColor}`,
                boxShadow: "0 6px 20px color-mix(in srgb, currentColor 14%, transparent)",
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 96, height: 96, borderRadius: avatarRadius, display: "grid", placeItems: "center",
                background: `color-mix(in srgb, ${s.accentColor} 35%, transparent)`, border: `2px solid ${s.accentColor}`,
                fontSize: 36, fontWeight: 600,
              }}
            >
              {Array.from(data.displayName.trim())[0]?.toUpperCase() ?? "?"}
            </div>
          )
        ) : null}

        <h1 {...rise(1)} style={{ margin: "18px 0 0", fontSize: "1.75rem", lineHeight: 1.15, fontWeight: 650, letterSpacing: "-0.02em", textWrap: "balance", overflowWrap: "anywhere", ...(rise(1).style ?? {}) }}>
          {data.displayName}
        </h1>
        <p style={{ margin: "4px 0 0", opacity: 0.72, fontSize: "0.95rem" }}>@{data.username}</p>
        {data.bio ? (
          <p style={{ margin: "12px 0 0", maxWidth: "42ch", whiteSpace: "pre-line", lineHeight: 1.6, overflowWrap: "anywhere", textWrap: "pretty", opacity: 0.9 }}>
            {data.bio}
          </p>
        ) : null}

        <ul style={{ listStyle: "none", margin: "28px 0 0", padding: 0, width: "100%", display: "flex", flexDirection: "column", gap: GAP[s.spacing] }}>
          {data.links.map((link, i) => {
            const href = mode === "live" ? safeHref(link.url) : null;
            return (
              <li key={link.id} {...rise(i + 2)}>
                {mode === "live" && href ? (
                  <a className="rona-link" href={href} target="_blank" rel="noopener noreferrer" style={cardStyle(s)}>
                    <LinkBody link={link} s={s} />
                  </a>
                ) : (
                  <div className="rona-link" style={cardStyle(s)}>
                    <LinkBody link={link} s={s} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {data.links.length === 0 ? (
          <p style={{ marginTop: 28, opacity: 0.6, fontSize: "0.9rem" }}>Belum ada tautan yang ditampilkan.</p>
        ) : null}

      </div>

      {/* Katalog (Phase 5): kolom lebih lebar dari kolom tautan; tidak dirender bila nonaktif/kosong. */}
      {data.catalog ? <CatalogSection catalog={data.catalog} settings={s} mode={mode} /> : null}

      <p style={{ margin: "0 auto", padding: "36px 20px 28px", textAlign: "center", fontSize: "0.75rem", opacity: 0.55 }}>dibuat dengan RONA</p>
    </div>
  );
}
