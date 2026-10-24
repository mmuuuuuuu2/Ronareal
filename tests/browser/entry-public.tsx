import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PageView } from "@/components/page/page-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, tabIds } from "@/components/ui/tabs";
import { Toast } from "@/components/ui/toast";
import { parsePublicSnapshot } from "@/lib/publish/snapshot";

const UID = "11111111-2222-4333-8444-555555555555", SB = "https://abcdefgh.supabase.co";
const I1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", I2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const p = (n: string) => `${UID}/catalog/${n}.webp`;
const mk = (id: string, title: string, nimg: number, extra: Record<string, unknown> = {}) => ({
  id, title, summary: "Ringkasan singkat yang bisa cukup panjang untuk menguji pemotongan baris pada kartu katalog.", description: "Baris1\nBaris2 panjang panjang panjang panjang panjang panjang",
  price_amount: 1500000, price_label: "Mulai dari", cta_type: "whatsapp", cta_value: "081234567890", cta_label: null, cta_message: null, cover: nimg ? p(id.slice(0, 4) + "0") : null,
  images: Array.from({ length: nimg }, (_, i) => ({ path: p(id.slice(0, 4) + i), thumb: p(id.slice(0, 4) + i + "-t"), w: 1600, h: 1200 })), ...extra,
});
const raw = {
  profile: { username: "nadia", display_name: "Nadia Rahmawati", bio: "Fotografer & desainer. Bio yang agak panjang untuk menguji pembungkusan teks di layar sempit sekali 📸", avatar_path: null },
  background_path: null, config: { catalog: { enabled: true, title: "Karya Saya" } }, version: 1, published_at: "2026-10-19T00:00:00Z",
  links: [1, 2, 3].map((i) => ({ id: String(i), title: `Tautan nomor ${i} dengan judul agak panjang sekali untuk uji`, url: "https://toko.example/" + i, config: {} })),
  catalog: [
    mk(I1, "Paket Foto 📸", 3),
    mk(I2, "Jasa Desain Logo", 1, { cta_type: "url", cta_value: "https://contoh.com/pesan" }),
    mk("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Tanpa foto", 0, { cta_type: "url", cta_value: "javascript:alert(1)" }),
    mk("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Kursus", 2),
    mk("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "Konsultasi", 2),
  ],
};

function Confirm() {
  const [open, setOpen] = useState(false); const [log, setLog] = useState("");
  return (<div style={{ padding: 20 }}>
    <button id="open-confirm" className="btn btn-danger" onClick={() => setOpen(true)}>Hapus</button>
    <p id="log">{log}</p>
    <ConfirmDialog open={open} title="Hapus item?" description="Akan dihapus dari draft." confirmLabel="Ya, hapus" onCancel={() => { setOpen(false); setLog("cancel"); }} onConfirm={() => { setOpen(false); setLog("confirm"); }} />
  </div>);
}
const TABS = [{ id: "a", label: "Profil" }, { id: "b", label: "Tampilan" }, { id: "c", label: "Tautan" }, { id: "d", label: "Katalog" }] as const;
function TabsDemo() {
  const [v, setV] = useState<"a" | "b" | "c" | "d">("a");
  return (<div style={{ padding: 20 }}>
    <Tabs idPrefix="t" label="Bagian" value={v} onChange={setV} tabs={TABS.map((t) => ({ ...t }))} />
    <div id={tabIds("t", v).panel} role="tabpanel" aria-labelledby={tabIds("t", v).tab}>Panel {v}</div>
  </div>);
}
function ToastDemo() {
  const [m, setM] = useState<string | null>("Draft tersimpan");
  return <Toast message={m} kind="success" onDismiss={() => setM(null)} />;
}

const w = window as unknown as { mount: (n: string, o?: Record<string, unknown>) => void };
w.mount = (name, o = {}) => {
  const el = document.getElementById("root")!;
  const root = createRoot(el);
  if (name === "page") {
    const page = parsePublicSnapshot({ ...raw, ...o }, SB)!;
    root.render(<PageView data={page.view} mode={(o.mode as "live" | "preview") ?? "live"} fill="viewport" />);
  } else if (name === "confirm") root.render(<Confirm />);
  else if (name === "tabs") root.render(<TabsDemo />);
  else if (name === "toast") root.render(<ToastDemo />);
};
