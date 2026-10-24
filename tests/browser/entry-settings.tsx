import { createRoot } from "react-dom/client";
import { SettingsShell } from "@/components/settings/settings-shell";
import { DEFAULT_SEO } from "@/lib/seo/seo";
import { parseSettingsTab } from "@/lib/settings/tabs";

const q = new URLSearchParams(location.search);
const published = q.get("published") !== "0";
const initial = {
  userId: "u1",
  email: { current: "rona@contoh.com", pending: null },
  lastSignInAt: "2026-10-21T05:00:00Z",
  createdAt: "2026-10-01T05:00:00Z",
  profile: { username: "rona", displayName: "Rona Studio", bio: "Bio awal", rev: 2 },
  seo: { ...DEFAULT_SEO, title: "Judul Awal" },
  seoRev: 3,
  publish: { isPublished: published, version: 1, publishedAt: "2026-10-21T05:00:00Z", hasChanges: q.get("changes") === "1" },
  everPublished: true,
};
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: "16px", maxWidth: 1100, margin: "0 auto" }}>
    <SettingsShell initial={initial} siteUrl="https://rona.example" initialTab={parseSettingsTab(q.get("tab"))} />
  </div>,
);
