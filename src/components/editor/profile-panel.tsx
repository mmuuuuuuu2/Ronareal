"use client";

import Link from "next/link";
import { ImageField } from "@/components/editor/image-field";
import { TextField } from "@/components/ui/text-field";
import type { ProfileDraft } from "@/lib/editor/state";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validation/auth";
import { BIO_MAX_LENGTH } from "@/lib/validation/profile";
import { USERNAME_MAX_LENGTH } from "@/lib/validation/username";

type Props = {
  profile: ProfileDraft;
  errors: Record<string, string>;
  avatarUrl: string | null;
  isPublished: boolean;
  onChange: (field: keyof ProfileDraft, value: string) => void;
  onAvatar: (next: { path: string | null; url: string | null }) => void;
  onSignedOut: () => void;
};

export function ProfilePanel({ profile, errors, avatarUrl, isPublished, onChange, onAvatar, onSignedOut }: Props) {
  return (
    <div className="space-y-5">
      <ImageField
        kind="avatar"
        label="Foto profil"
        currentUrl={avatarUrl}
        onChanged={onAvatar}
        onSignedOut={onSignedOut}
      />
      <TextField
        id="ed-display-name"
        label="Nama tampilan"
        value={profile.displayName}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        onChange={(e) => onChange("displayName", e.target.value)}
        error={errors.displayName}
        autoComplete="off"
      />
      <TextField
        id="ed-username"
        label="Username"
        value={profile.username}
        maxLength={USERNAME_MAX_LENGTH}
        onChange={(e) => onChange("username", e.target.value)}
        error={errors.username}
        hint={`Alamatmu: /${profile.username.trim() || "username"}. Username diubah di Pengaturan${isPublished ? " (berlaku langsung; URL lama berhenti bekerja)" : ""}.`}
        readOnly
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Link href="/dashboard/settings?tab=username" className="btn btn-ghost btn-sm">Ubah username di Pengaturan</Link>
      <div>
        <label htmlFor="ed-bio" className="field-label">Bio</label>
        <textarea
          id="ed-bio"
          className="field-textarea"
          rows={4}
          maxLength={BIO_MAX_LENGTH}
          value={profile.bio}
          onChange={(e) => onChange("bio", e.target.value)}
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby="ed-bio-hint"
        />
        {errors.bio ? (
          <p className="field-error" role="alert">{errors.bio}</p>
        ) : (
          <p id="ed-bio-hint" className="field-hint">
            {Array.from(profile.bio).length}/{BIO_MAX_LENGTH} karakter
          </p>
        )}
      </div>
    </div>
  );
}
