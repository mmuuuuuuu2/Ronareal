"use client";

import { ImageField } from "@/components/editor/image-field";
import {
  ALIGNMENTS, AVATAR_SHAPES, COMPONENT_STYLES, RADII, SPACINGS, contrastWarning, type PageSettings,
} from "@/lib/editor/settings";

const LABELS = {
  componentStyle: { glass: "Kaca", solid: "Solid", outline: "Garis" },
  radius: { sm: "Kecil", md: "Sedang", lg: "Besar", pill: "Pil" },
  spacing: { compact: "Rapat", comfortable: "Nyaman", airy: "Lega" },
  avatarShape: { circle: "Lingkaran", rounded: "Kotak bulat", hidden: "Sembunyikan" },
  alignment: { center: "Tengah", left: "Kiri" },
} as const;

function Choice<T extends string>({
  legend, value, options, labels, onPick,
}: { legend: string; value: T; options: readonly T[]; labels: Record<T, string>; onPick: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className="seg" role="group" aria-label={legend} style={{ flexWrap: "wrap", borderRadius: 22 }}>
        {options.map((o) => (
          <button key={o} type="button" className="seg-btn" aria-pressed={value === o} onClick={() => onPick(o)}>
            {labels[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="color" className="field-color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <code className="text-sm">{value}</code>
      </div>
    </div>
  );
}

type Props = {
  settings: PageSettings;
  backgroundUrl: string | null;
  onChange: (patch: Partial<PageSettings>) => void;
  onReset: () => void;
  onBackground: (next: { path: string | null; url: string | null }) => void;
  onSignedOut: () => void;
};

export function AppearancePanel({ settings, backgroundUrl, onChange, onReset, onBackground, onSignedOut }: Props) {
  const warn = contrastWarning(settings);
  return (
    <div className="space-y-6">
      <Choice legend="Latar" value={settings.backgroundMode} options={["color", "image"] as const} labels={{ color: "Warna", image: "Gambar" }} onPick={(v) => onChange({ backgroundMode: v })} />

      <div className="grid grid-cols-2 gap-4">
        <ColorField id="ed-bg-color" label="Warna latar" value={settings.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        <ColorField id="ed-text-color" label="Warna teks" value={settings.textColor} onChange={(v) => onChange({ textColor: v })} />
        <ColorField id="ed-accent-color" label="Warna aksen" value={settings.accentColor} onChange={(v) => onChange({ accentColor: v })} />
      </div>
      {warn ? <p className="notice" role="status">{warn}</p> : null}

      {settings.backgroundMode === "image" ? (
        <div className="space-y-4">
          <ImageField
            kind="background"
            label="Gambar latar"
            hint="Dipotong ke rasio layar ponsel (9:16)."
            currentUrl={backgroundUrl}
            onChanged={onBackground}
            onSignedOut={onSignedOut}
          />
          <div>
            <label htmlFor="ed-overlay" className="field-label">Lapisan warna latar di atas gambar: {settings.backgroundOverlay}%</label>
            <input id="ed-overlay" type="range" min={0} max={60} step={5} value={settings.backgroundOverlay} className="w-full" onChange={(e) => onChange({ backgroundOverlay: Number(e.target.value) })} />
            <p className="field-hint">Naikkan bila teks sulit dibaca di atas gambar.</p>
          </div>
        </div>
      ) : null}

      <Choice legend="Gaya komponen" value={settings.componentStyle} options={COMPONENT_STYLES} labels={LABELS.componentStyle} onPick={(v) => onChange({ componentStyle: v })} />
      <Choice legend="Sudut" value={settings.radius} options={RADII} labels={LABELS.radius} onPick={(v) => onChange({ radius: v })} />
      <Choice legend="Jarak antar tautan" value={settings.spacing} options={SPACINGS} labels={LABELS.spacing} onPick={(v) => onChange({ spacing: v })} />
      <Choice legend="Foto profil" value={settings.avatarShape} options={AVATAR_SHAPES} labels={LABELS.avatarShape} onPick={(v) => onChange({ avatarShape: v })} />
      <Choice legend="Perataan" value={settings.alignment} options={ALIGNMENTS} labels={LABELS.alignment} onPick={(v) => onChange({ alignment: v })} />

      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={settings.showDescriptions} onChange={(e) => onChange({ showDescriptions: e.target.checked })} />
        Tampilkan deskripsi tautan
      </label>

      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>Kembalikan ke bawaan</button>
      </div>
    </div>
  );
}
