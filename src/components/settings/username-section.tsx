"use client";

import { useEffect, useRef, useState } from "react";
import { changeUsernameAction } from "@/app/dashboard/settings/actions";
import { checkUsernameAction } from "@/app/onboarding/actions";
import { CopyUrl } from "@/components/publish/copy-url";
import { SectionCard, StatusLine } from "@/components/settings/section-parts";
import { useSaver } from "@/components/settings/use-saver";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/text-field";
import { buildPublicUrl } from "@/lib/publish/state";
import { USERNAME_MAX_LENGTH, validateUsername } from "@/lib/validation/username";

type Remote = { value: string; status: "available" | "unavailable" | "error" };
const DEBOUNCE_MS = 500;

type Props = {
  username: string;
  isPublished: boolean;
  siteUrl: string | null;
  onChanged: (next: { username: string; profileRev: number }) => void;
  onDirty: (dirty: boolean) => void;
  onSignedOut: () => void;
  onNotify: (message: string) => void;
};

export function UsernameSection({ username, isPublished, siteUrl, onChanged, onDirty, onSignedOut, onNotify }: Props) {
  const [value, setValue] = useState(username);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const saver = useSaver(onSignedOut);
  const latest = useRef("");

  const local = validateUsername(value);
  const candidate = local.ok && local.value !== username ? local.value : "";
  const dirty = value.trim().toLowerCase() !== username;

  // Cek ketersediaan: hanya untuk nilai berformat valid yang berbeda dari username sekarang, setelah jeda mengetik.
  // Hanya kenyamanan — server dan database tetap menjadi otoritas saat menyimpan.
  useEffect(() => {
    latest.current = candidate;
    if (!candidate) return;
    const t = setTimeout(async () => {
      let status: Remote["status"] = "error";
      try {
        const r = await checkUsernameAction(candidate);
        status = r.status === "available" ? "available" : r.status === "unavailable" ? "unavailable" : "error";
      } catch { /* status error */ }
      if (latest.current === candidate) setRemote({ value: candidate, status });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [candidate]);

  let hint: { tone: "hint" | "error" | "ok"; text: string };
  if (saver.fieldError("username")) hint = { tone: "error", text: saver.fieldError("username") ?? "" };
  else if (!dirty) hint = { tone: "hint", text: "Ini username Anda saat ini." };
  else if (!local.ok) hint = { tone: "error", text: local.message };
  else if (remote?.value !== candidate) hint = { tone: "hint", text: "Memeriksa ketersediaan…" };
  else if (remote.status === "available") hint = { tone: "ok", text: "Username tersedia." };
  else if (remote.status === "unavailable") hint = { tone: "error", text: "Username tidak tersedia (dipakai, dicadangkan sistem, atau baru dilepas pemilik lain)." };
  else hint = { tone: "hint", text: "Ketersediaan belum dapat diperiksa. Anda tetap bisa mencoba menyimpan." };

  const newUrl = local.ok ? buildPublicUrl(siteUrl ?? (typeof window !== "undefined" ? window.location.origin : ""), local.value) : null;
  const canSave = dirty && local.ok && !saver.saving && !(remote?.value === candidate && remote.status === "unavailable");

  async function save() {
    setConfirming(false);
    await saver.run(() => changeUsernameAction({ username: value }), "Username diperbarui.", (r) => {
      setValue(r.username);
      setRemote(null);
      if (r.changed) onChanged({ username: r.username, profileRev: r.profileRev });
      onDirty(false);
      onNotify(r.changed ? `Username diubah menjadi @${r.username}.` : "Tidak ada perubahan.");
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard id="un" title="Username dan URL" description="Username adalah alamat halaman publikmu. Huruf kecil, angka, tanda hubung (-) dan garis bawah (_), 3–30 karakter.">
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (!canSave) return;
            if (isPublished) setConfirming(true); else void save();
          }}
        >
          <div>
            <TextField
              id="un-input"
              label="Username"
              value={value}
              maxLength={USERNAME_MAX_LENGTH}
              onChange={(e) => { setValue(e.target.value); onDirty(e.target.value.trim().toLowerCase() !== username); saver.reset(); }}
              error={hint.tone === "error" ? hint.text : undefined}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
            />
            {hint.tone !== "error" ? (
              <p className={hint.tone === "ok" ? "field-ok" : "field-hint"} role="status" aria-live="polite">{hint.text}</p>
            ) : null}
          </div>
          {newUrl && dirty ? (
            <p className="text-sm break-all">Alamat baru: <span className="font-medium">{newUrl}</span></p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {saver.saving ? "Menyimpan…" : "Simpan username"}
          </button>
          <StatusLine status={saver.status} />
        </form>
        <p className="text-sm" style={{ color: "var(--rona-fg-muted)" }}>
          Username lama tidak dialihkan otomatis: alamat lamanya menampilkan “tidak ditemukan”. Nama lama dicadangkan 30 hari
          agar tidak bisa langsung dipakai orang lain.
        </p>
      </SectionCard>

      <SectionCard id="un-url" title="Alamat publik" description={isPublished ? "Halamanmu aktif di alamat ini." : "Alamat ini baru bisa dibuka setelah halaman diterbitkan."}>
        {isPublished ? (
          <CopyUrl username={username} baseUrl={siteUrl} />
        ) : (
          <p className="field-hint">Halaman belum diterbitkan, jadi alamat <span className="break-all">/{username}</span> belum aktif.</p>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirming}
        title={`Ganti username menjadi @${local.ok ? local.value : value}?`}
        description={`Halamanmu sedang terbit. Alamat lama /${username} langsung berhenti bekerja (tidak ada pengalihan) dan tautan yang sudah dibagikan akan menampilkan “tidak ditemukan”. Isi halaman tidak berubah.`}
        confirmLabel="Ya, ganti username"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void save()}
      />
    </div>
  );
}
