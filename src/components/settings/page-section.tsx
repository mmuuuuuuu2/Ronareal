"use client";

import Link from "next/link";
import { useState } from "react";
import { saveProfileFieldsAction } from "@/app/dashboard/settings/actions";
import { SectionCard, StatusLine } from "@/components/settings/section-parts";
import { useSaver } from "@/components/settings/use-saver";
import { BIO_MAX_LENGTH } from "@/lib/validation/profile";

type Props = {
  displayName: string;
  bio: string;
  profileRev: number;
  isPublished: boolean;
  onSaved: (next: { bio: string; profileRev: number }) => void;
  onDirty: (dirty: boolean) => void;
  onGoto: (tab: "akun" | "status") => void;
  onSignedOut: () => void;
  onNotify: (message: string) => void;
};

export function PageSection({ displayName, bio, profileRev, isPublished, onSaved, onDirty, onGoto, onSignedOut, onNotify }: Props) {
  const [text, setText] = useState(bio);
  const saver = useSaver(onSignedOut);
  const dirty = text.replace(/\r\n/g, "\n").trim() !== bio;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    await saver.run(() => saveProfileFieldsAction({ bio: text, rev: profileRev }), "Deskripsi disimpan sebagai draft.", (r) => {
      setText(r.bio);
      onSaved({ bio: r.bio, profileRev: r.revs.profile });
      onDirty(false);
      onNotify("Deskripsi halaman disimpan.");
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard id="pg" title="Identitas halaman" description="Judul dan deskripsi yang tampil di bagian atas halaman publikmu.">
        <div className="text-sm">
          <p style={{ color: "var(--rona-fg-muted)" }}>Judul halaman</p>
          <p className="font-medium" data-testid="page-title">{displayName || "(belum diisi)"}</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => onGoto("akun")}>Ubah di tab Akun</button>
        </div>
        <form onSubmit={save} className="space-y-3" noValidate>
          <div>
            <label htmlFor="pg-bio" className="field-label">Deskripsi halaman</label>
            <textarea
              id="pg-bio"
              className="field-textarea"
              rows={4}
              maxLength={BIO_MAX_LENGTH}
              value={text}
              onChange={(e) => { setText(e.target.value); onDirty(true); saver.reset(); }}
              aria-invalid={saver.fieldError("bio") ? true : undefined}
              aria-describedby="pg-bio-hint"
            />
            {saver.fieldError("bio") ? (
              <p className="field-error" role="alert">{saver.fieldError("bio")}</p>
            ) : (
              <p id="pg-bio-hint" className="field-hint">{Array.from(text).length}/{BIO_MAX_LENGTH} karakter. Dipakai juga sebagai deskripsi bawaan SEO.</p>
            )}
          </div>
          <button type="submit" className="btn btn-primary" disabled={saver.saving || !dirty}>
            {saver.saving ? "Menyimpan…" : "Simpan deskripsi"}
          </button>
          <StatusLine status={saver.status} />
        </form>
        <p className="notice" role="note">
          Perubahan ini tersimpan sebagai draft. Halaman publik baru berubah setelah Anda menerbitkan (lihat tab Status).
        </p>
      </SectionCard>

      <SectionCard id="pg-vis" title="Visibilitas" description="Apakah halamanmu bisa dibuka pengunjung.">
        <p className="text-sm">{isPublished ? "Halamanmu terbit dan bisa dibuka siapa pun." : "Halamanmu masih draft pribadi."}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoto("status")}>Kelola status halaman</button>
      </SectionCard>

      <SectionCard id="pg-look" title="Tampilan dan isi" description="Warna, latar, tautan, dan katalog diatur di editor.">
        <Link href="/dashboard/editor" className="btn btn-ghost btn-sm">Buka editor</Link>
      </SectionCard>
    </div>
  );
}
