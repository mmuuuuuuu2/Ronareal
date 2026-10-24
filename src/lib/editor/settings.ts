// Pengaturan tampilan halaman yang disimpan di pages.draft_config (jsonb). Modul murni.
// parseDraftConfig() toleran: data rusak/lama tidak pernah membuat editor gagal; nilai tak valid diganti default.
// sanitizeSettings() ketat: dipakai server action sebelum menulis ke database.

export const DRAFT_CONFIG_VERSION = 1;

export const COMPONENT_STYLES = ["glass", "solid", "outline"] as const;
export const RADII = ["sm", "md", "lg", "pill"] as const;
export const SPACINGS = ["compact", "comfortable", "airy"] as const;
export const AVATAR_SHAPES = ["circle", "rounded", "hidden"] as const;
export const ALIGNMENTS = ["center", "left"] as const;
export const BACKGROUND_MODES = ["color", "image"] as const;

export type PageSettings = {
  backgroundMode: (typeof BACKGROUND_MODES)[number];
  backgroundColor: string;
  backgroundOverlay: number; // 0–60 (%) gelap/terang untuk keterbacaan di atas gambar
  textColor: string;
  accentColor: string;
  componentStyle: (typeof COMPONENT_STYLES)[number];
  radius: (typeof RADII)[number];
  spacing: (typeof SPACINGS)[number];
  avatarShape: (typeof AVATAR_SHAPES)[number];
  alignment: (typeof ALIGNMENTS)[number];
  showDescriptions: boolean;
};

export const DEFAULT_SETTINGS: PageSettings = {
  backgroundMode: "color",
  backgroundColor: "#F7F6F2", // Porcelain
  backgroundOverlay: 0,
  textColor: "#222222", // Soft ink
  accentColor: "#B5A58D", // Champagne
  componentStyle: "glass",
  radius: "lg",
  spacing: "comfortable",
  avatarShape: "circle",
  alignment: "center",
  showDescriptions: true,
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}
function overlay(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(60, Math.max(0, Math.round(value)));
}

/** Menormalkan objek apa pun menjadi PageSettings valid. Tidak pernah melempar. */
export function sanitizeSettings(raw: unknown): PageSettings {
  const o = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    backgroundMode: pick(o.backgroundMode, BACKGROUND_MODES, d.backgroundMode),
    backgroundColor: hex(o.backgroundColor, d.backgroundColor),
    backgroundOverlay: overlay(o.backgroundOverlay, d.backgroundOverlay),
    textColor: hex(o.textColor, d.textColor),
    accentColor: hex(o.accentColor, d.accentColor),
    componentStyle: pick(o.componentStyle, COMPONENT_STYLES, d.componentStyle),
    radius: pick(o.radius, RADII, d.radius),
    spacing: pick(o.spacing, SPACINGS, d.spacing),
    avatarShape: pick(o.avatarShape, AVATAR_SHAPES, d.avatarShape),
    alignment: pick(o.alignment, ALIGNMENTS, d.alignment),
    showDescriptions: typeof o.showDescriptions === "boolean" ? o.showDescriptions : d.showDescriptions,
  };
}

/** Membaca pages.draft_config (apa pun isinya) -> pengaturan. Konfigurasi kosong `{}` menghasilkan default. */
export function parseDraftConfig(raw: unknown): PageSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  return sanitizeSettings(o.settings);
}

/**
 * Menyusun draft_config baru TANPA membuang kunci lain yang mungkin ditulis fase lain (mis. katalog).
 * Hanya `version` dan `settings` yang dikelola editor.
 */
export function buildDraftConfig(existing: unknown, settings: PageSettings): Record<string, unknown> {
  const base =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, version: DRAFT_CONFIG_VERSION, settings: sanitizeSettings(settings) };
}

/** Rasio kontras WCAG antara dua warna hex (1–21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
  };
  const l1 = lum(a);
  const l2 = lum(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Peringatan (bukan blokir) bila teks sulit dibaca di atas warna latar. */
export function contrastWarning(settings: PageSettings): string | null {
  if (!HEX_COLOR.test(settings.textColor) || !HEX_COLOR.test(settings.backgroundColor)) return null;
  if (settings.backgroundMode === "image") return null; // bergantung gambar; ditangani overlay
  const ratio = contrastRatio(settings.textColor, settings.backgroundColor);
  return ratio < 4.5 ? `Kontras teks dan latar rendah (${ratio.toFixed(1)}:1). Disarankan minimal 4,5:1.` : null;
}
