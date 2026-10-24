// Tab halaman pengaturan — modul murni (dipakai server untuk ?tab= dan client untuk daftar tab).
export const SETTINGS_TABS = [
  { id: "akun", label: "Akun" },
  { id: "username", label: "Username & URL" },
  { id: "halaman", label: "Pengaturan halaman" },
  { id: "seo", label: "SEO & berbagi sosial" },
  { id: "status", label: "Status halaman" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function parseSettingsTab(raw: unknown): SettingsTab {
  return SETTINGS_TABS.find((t) => t.id === raw)?.id ?? "akun";
}
