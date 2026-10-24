"use client";

import { useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import {
  changePasswordAction, requestEmailChangeAction, saveProfileFieldsAction, sendPasswordResetAction, signOutOthersAction,
} from "@/app/dashboard/settings/actions";
import { SectionCard, StatusLine } from "@/components/settings/section-parts";
import { useSaver } from "@/components/settings/use-saver";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/text-field";
import { formatWhen, type EmailStatus } from "@/lib/account/account";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validation/auth";

type Props = {
  email: EmailStatus;
  username: string;
  displayName: string;
  profileRev: number;
  lastSignInAt: string | null;
  createdAt: string | null;
  onSaved: (next: { displayName: string; profileRev: number }) => void;
  onDirty: (dirty: boolean) => void;
  onSignedOut: () => void;
  onNotify: (message: string) => void;
};

export function AccountSection({ email, username, displayName, profileRev, lastSignInAt, createdAt, onSaved, onDirty, onSignedOut, onNotify }: Props) {
  // --- nama profil
  const [name, setName] = useState(displayName);
  const nameSaver = useSaver(onSignedOut);
  const nameDirty = name.trim().replace(/\s+/g, " ") !== displayName;
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameDirty) return;
    await nameSaver.run(() => saveProfileFieldsAction({ displayName: name, rev: profileRev }), "Nama profil disimpan.", (r) => {
      setName(r.displayName);
      onSaved({ displayName: r.displayName, profileRev: r.revs.profile });
      onDirty(false);
      onNotify("Nama profil disimpan.");
    });
  }

  // --- email
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(email.pending);
  const emailSaver = useSaver(onSignedOut);
  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    await emailSaver.run(() => requestEmailChangeAction({ email: newEmail }), "", (r) => {
      setPending(r.pendingEmail);
      setNewEmail("");
    });
  }

  // --- kata sandi
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const pwSaver = useSaver(onSignedOut);
  const resetSaver = useSaver(onSignedOut);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    await pwSaver.run(() => changePasswordAction({ password: pw, confirmPassword: pw2 }), "Kata sandi diperbarui.", () => {
      setPw("");
      setPw2("");
      onNotify("Kata sandi diperbarui.");
    });
  }

  // --- sesi
  const [confirmOthers, setConfirmOthers] = useState(false);
  const othersSaver = useSaver(onSignedOut);
  const signIn = formatWhen(lastSignInAt);
  const created = formatWhen(createdAt);

  return (
    <div className="space-y-5">
      <SectionCard id="acc-info" title="Informasi akun" description="Email dipakai untuk masuk. Username menentukan alamat halaman publikmu.">
        <dl className="space-y-3 text-sm">
          <div>
            <dt style={{ color: "var(--rona-fg-muted)" }}>Email</dt>
            <dd className="font-medium break-all" data-testid="account-email">{email.current || "-"}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--rona-fg-muted)" }}>Username</dt>
            <dd className="font-medium">@{username}</dd>
          </div>
        </dl>
        <form onSubmit={saveName} className="space-y-3" noValidate>
          <TextField
            id="acc-name"
            label="Nama profil"
            value={name}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChange={(e) => { setName(e.target.value); onDirty(true); nameSaver.reset(); }}
            error={nameSaver.fieldError("displayName")}
            hint="Tampil di halaman publik setelah Anda menerbitkan."
            autoComplete="name"
          />
          <button type="submit" className="btn btn-primary" disabled={nameSaver.saving || !nameDirty}>
            {nameSaver.saving ? "Menyimpan…" : "Simpan nama"}
          </button>
          <StatusLine status={nameSaver.status} />
        </form>
      </SectionCard>

      <SectionCard
        id="acc-email"
        title="Ganti email"
        description="Kami mengirim tautan konfirmasi. Email aktif baru berganti setelah Anda mengonfirmasinya."
      >
        {pending ? (
          <p className="notice" role="status" data-testid="email-pending">
            Menunggu konfirmasi untuk <strong className="break-all">{pending}</strong>. Buka tautan di email yang kami kirim
            (jika diminta, di email lama juga). Sampai dikonfirmasi, Anda tetap masuk dengan <span className="break-all">{email.current}</span>.
          </p>
        ) : null}
        <form onSubmit={changeEmail} className="space-y-3" noValidate>
          <TextField
            id="acc-new-email"
            label="Email baru"
            type="email"
            inputMode="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); emailSaver.reset(); }}
            error={emailSaver.fieldError("email")}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={emailSaver.saving || !newEmail.trim()}>
            {emailSaver.saving ? "Mengirim…" : "Kirim konfirmasi"}
          </button>
          {emailSaver.status.kind === "ok" ? (
            <p className="notice notice-success" role="status">Permintaan terkirim. Email belum berubah sampai Anda mengonfirmasinya.</p>
          ) : (
            <StatusLine status={emailSaver.status} />
          )}
        </form>
      </SectionCard>

      <SectionCard id="acc-pw" title="Kata sandi" description="Gunakan kata sandi yang panjang dan unik. Kata sandi tidak pernah kami simpan atau tampilkan.">
        <form onSubmit={changePassword} className="space-y-3" noValidate>
          <TextField
            id="acc-pw1"
            label="Kata sandi baru"
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); pwSaver.reset(); }}
            error={pwSaver.fieldError("password")}
            autoComplete="new-password"
            hint="Minimal 8 karakter."
          />
          <TextField
            id="acc-pw2"
            label="Ulangi kata sandi baru"
            type="password"
            value={pw2}
            onChange={(e) => { setPw2(e.target.value); pwSaver.reset(); }}
            error={pwSaver.fieldError("confirmPassword")}
            autoComplete="new-password"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={pwSaver.saving || !pw}>
              {pwSaver.saving ? "Menyimpan…" : "Ubah kata sandi"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={resetSaver.saving}
              onClick={() => resetSaver.run(() => sendPasswordResetAction(), "Tautan atur ulang kata sandi dikirim ke email Anda.", () => {})}
            >
              {resetSaver.saving ? "Mengirim…" : "Kirim tautan atur ulang ke email"}
            </button>
          </div>
          <StatusLine status={pwSaver.status} />
          <StatusLine status={resetSaver.status} />
        </form>
      </SectionCard>

      <SectionCard id="acc-session" title="Sesi" description="Keluar hanya mengakhiri sesi masuk. Ini bukan penghapusan akun dan tidak menghapus data apa pun.">
        <dl className="space-y-2 text-sm">
          {signIn ? (
            <div>
              <dt style={{ color: "var(--rona-fg-muted)" }}>Masuk terakhir</dt>
              <dd className="font-medium">{signIn}</dd>
            </div>
          ) : null}
          {created ? (
            <div>
              <dt style={{ color: "var(--rona-fg-muted)" }}>Akun dibuat</dt>
              <dd className="font-medium">{created}</dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          <form action={logoutAction}>
            <button type="submit" className="btn btn-primary">Keluar</button>
          </form>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmOthers(true)} disabled={othersSaver.saving}>
            Keluar dari perangkat lain
          </button>
        </div>
        <StatusLine status={othersSaver.status} />
      </SectionCard>

      <ConfirmDialog
        open={confirmOthers}
        title="Keluar dari perangkat lain?"
        description="Semua sesi lain akan berakhir dan harus masuk lagi. Sesi di perangkat ini tetap aktif."
        confirmLabel="Ya, keluarkan perangkat lain"
        danger={false}
        onCancel={() => setConfirmOthers(false)}
        onConfirm={() => {
          setConfirmOthers(false);
          void othersSaver.run(() => signOutOthersAction(), "Perangkat lain sudah dikeluarkan.", () => {});
        }}
      />
    </div>
  );
}
