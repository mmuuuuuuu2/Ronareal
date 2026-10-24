import { createRoot } from "react-dom/client";
import { EditorShell } from "@/components/editor/editor-shell";
import { DEFAULT_SETTINGS } from "@/lib/editor/settings";
import { parsePublishState } from "@/lib/publish/state";

const link = (i: number) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`, title: `Tautan ${i}`, url: `https://contoh.com/${i}`, description: "Deskripsi", icon: null, isVisible: true,
  imagePath: null, imageUrl: null, saved: { title: `Tautan ${i}`, url: `https://contoh.com/${i}`, description: "Deskripsi", icon: null }, status: "idle" as const,
});
const item = (i: number) => ({
  id: `10000000-0000-4000-8000-00000000000${i}`, isVisible: true, coverId: null, photos: [], status: "idle" as const,
  fields: { title: `Layanan ${i}`, summary: "Ringkas", description: "", priceAmount: "150000", priceLabel: "Mulai dari", ctaType: "whatsapp", ctaValue: "081234567890", ctaLabel: "", ctaMessage: "" },
  saved: { title: `Layanan ${i}`, summary: "Ringkas", description: "", priceAmount: "150000", priceLabel: "Mulai dari", ctaType: "whatsapp", ctaValue: "081234567890", ctaLabel: "", ctaMessage: "" },
});
const initial: any = {
  profile: { displayName: "Nadia Rahmawati", bio: "Fotografer", username: "nadia" }, settings: { ...DEFAULT_SETTINGS }, avatarUrl: null, backgroundUrl: null,
  links: [link(1), link(2)], revs: { profile: 3, settings: 5 }, catalog: { enabled: true, title: "Layanan", items: [item(1)] }, isPublished: false,
  publishState: parsePublishState(null),
};
createRoot(document.getElementById("root")!).render(<div className="safe-x mx-auto flex min-h-dvh w-full max-w-6xl flex-col sm:px-6"><main className="flex-1 py-6 sm:py-8"><EditorShell initial={initial} /></main></div>);
