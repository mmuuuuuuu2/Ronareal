// Validasi kelayakan terbit — modul murni. Dijalankan di server sebelum menyalin aset; database memeriksa lagi.
import { validateDisplayName } from "../validation/auth.ts";
import { validateLink } from "../validation/link.ts";
import { validateUsername } from "../validation/username.ts";

export type PublishCandidate = {
  username: string;
  displayName: string;
  links: { title: string; url: string; description?: string; isVisible: boolean }[];
};

export type PublishCheck = { ok: true } | { ok: false; problems: string[] };

export function validatePublishable(c: PublishCandidate): PublishCheck {
  const problems: string[] = [];
  if (!validateUsername(c.username).ok) problems.push("Username belum valid.");
  if (!validateDisplayName(c.displayName).ok) problems.push("Nama tampilan belum diisi atau tidak valid.");

  const visible = c.links.filter((l) => l.isVisible);
  if (visible.length === 0) problems.push("Tampilkan minimal satu tautan sebelum menerbitkan.");
  visible.forEach((l, i) => {
    const v = validateLink({ title: l.title, url: l.url, description: l.description ?? "" });
    if (!v.ok) problems.push(`Tautan ${i + 1} ("${l.title.slice(0, 40)}") belum valid: ${Object.values(v.errors)[0] ?? "periksa isian"}`);
  });
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}
