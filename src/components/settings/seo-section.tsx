"use client";

import { useState } from "react";
import { saveSeoAction } from "@/app/dashboard/settings/actions";
import { SectionCard, StatusLine } from "@/components/settings/section-parts";
import { useSaver } from "@/components/settings/use-saver";
import { TextField } from "@/components/ui/text-field";
import { buildPublicUrl } from "@/lib/publish/state";
import { OG_IMAGE_SOURCES, SEO_LIMITS, TWITTER_CARDS, resolveMeta, sameSeo, type SeoSettings } from "@/lib/seo/seo";

type Props = {
  initial: SeoSettings;
  seoRev: number;
  username: string;
  displayName: string;
  bio: string;
  siteUrl: string | null;
  onDirty: (dirty: boolean) => void;
  onSignedOut: () => void;
  onNotify: (message: string) => void;
};

const OG_LABEL = { avatar: "Foto profil", background: "Gambar latar", none: "Tanpa gambar" } as const;
const CARD_LABEL = { summary: "Ringkas (gambar kecil)", summary_large_image: "Gambar besar" } as const;

export function SeoSection({ initial, seoRev, username, displayName, bio, siteUrl, onDirty, onSignedOut, onNotify }: Props) {
  const [saved, setSaved] = useState(initial);
  const [rev, setRev] = useState(seoRev);
  const [v, setV] = useState(initial);
  const saver = useSaver(onSignedOut);
  const dirty = !sameSeo(v, saved);
  const set = <K extends keyof SeoSettings>(k: K, val: SeoSettings[K]) => { setV((p) => ({ ...p, [k]: val })); onDirty(true); saver.reset(); };

  const preview = resolveMeta({ seo: v, username, displayName, bio, avatarUrl: v.ogImage === "avatar" ? "(foto profil)" : null, backgroundUrl: v.ogImage === "background" ? "(latar)" : null });
  const canonical = siteUrl ? buildPublicUrl(siteUrl, username) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    await saver.run(() => saveSeoAction({ seo: v, rev }), "SEO disimpan sebagai draft.", (r) => {
      setSaved(r.seo); setV(r.seo); setRev(r.seoRev); onDirty(false); onNotify("Pengaturan SEO disimpan.");
    });
  }

  const count = (s: string, max: number) => `${Array.from(s).length}/${max} karakter`;

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-5" noValidate>
        <SectionCard id="seo" title="Mesin pencari" description="Kosongkan untuk memakai nilai bawaan dari nama dan deskripsi halamanmu.">
          <TextField id="seo-title" label="Judul SEO" value={v.title} maxLength={SEO_LIMITS.title}
            onChange={(e) => set("title", e.target.value)} error={saver.fieldError("title")}
            hint={`${count(v.title, SEO_LIMITS.title)}. Bawaan: ${displayName || username} (@${username})`} autoComplete="off" />
          <div>
            <label htmlFor="seo-desc" className="field-label">Deskripsi meta</label>
            <textarea id="seo-desc" className="field-textarea" rows={3} maxLength={SEO_LIMITS.description} value={v.description}
              onChange={(e) => set("description", e.target.value)} aria-invalid={saver.fieldError("description") ? true : undefined} />
            {saver.fieldError("description") ? <p className="field-error" role="alert">{saver.fieldError("description")}</p>
              : <p className="field-hint">{count(v.description, SEO_LIMITS.description)}. Bawaan: deskripsi halaman.</p>}
          </div>
          <div className="text-sm">
            <p style={{ color: "var(--rona-fg-muted)" }}>URL kanonik (otomatis)</p>
            <p className="font-medium break-all" data-testid="seo-canonical">{canonical ?? `/${username}`}</p>
          </div>
        </SectionCard>

        <SectionCard id="og" title="Berbagi sosial" description="Tampilan saat tautan dibagikan di WhatsApp, Instagram, X, dan lainnya.">
          <TextField id="og-title" label="Judul berbagi" value={v.ogTitle} maxLength={SEO_LIMITS.ogTitle}
            onChange={(e) => set("ogTitle", e.target.value)} error={saver.fieldError("ogTitle")}
            hint={`${count(v.ogTitle, SEO_LIMITS.ogTitle)}. Kosong = sama dengan judul SEO.`} autoComplete="off" />
          <div>
            <label htmlFor="og-desc" className="field-label">Deskripsi berbagi</label>
            <textarea id="og-desc" className="field-textarea" rows={3} maxLength={SEO_LIMITS.ogDescription} value={v.ogDescription}
              onChange={(e) => set("ogDescription", e.target.value)} aria-invalid={saver.fieldError("ogDescription") ? true : undefined} />
            {saver.fieldError("ogDescription") ? <p className="field-error" role="alert">{saver.fieldError("ogDescription")}</p>
              : <p className="field-hint">{count(v.ogDescription, SEO_LIMITS.ogDescription)}. Kosong = sama dengan deskripsi meta.</p>}
          </div>
          <div>
            <label htmlFor="og-image" className="field-label">Gambar berbagi</label>
            <select id="og-image" className="field-input" value={v.ogImage} onChange={(e) => set("ogImage", e.target.value as SeoSettings["ogImage"])}>
              {OG_IMAGE_SOURCES.map((o) => <option key={o} value={o}>{OG_LABEL[o]}</option>)}
            </select>
            <p className="field-hint">Hanya gambar dari versi yang sudah diterbitkan yang dipakai; foto draft tidak pernah dibagikan.</p>
          </div>
          <div>
            <label htmlFor="og-card" className="field-label">Jenis kartu</label>
            <select id="og-card" className="field-input" value={v.twitterCard} onChange={(e) => set("twitterCard", e.target.value as SeoSettings["twitterCard"])}>
              {TWITTER_CARDS.map((o) => <option key={o} value={o}>{CARD_LABEL[o]}</option>)}
            </select>
          </div>
        </SectionCard>

        <SectionCard id="seo-prev" title="Pratinjau" description="Perkiraan teks yang tampil. Berlaku di halaman publik setelah diterbitkan.">
          <div className="surface p-3 text-sm" data-testid="seo-preview">
            <p className="font-semibold">{preview.ogTitle}</p>
            <p style={{ color: "var(--rona-fg-muted)" }}>{preview.ogDescription}</p>
            <p className="mt-1 text-xs break-all" style={{ color: "var(--rona-fg-muted)" }}>{canonical ?? `/${username}`}</p>
          </div>
        </SectionCard>

        <div className="space-y-3">
          <button type="submit" className="btn btn-primary" disabled={saver.saving || !dirty}>
            {saver.saving ? "Menyimpan…" : "Simpan SEO"}
          </button>
          <StatusLine status={saver.status} />
          <p className="notice" role="note">Disimpan sebagai draft. Halaman publik dan pratinjau tautan baru berubah setelah Anda menerbitkan.</p>
        </div>
      </form>
    </div>
  );
}
