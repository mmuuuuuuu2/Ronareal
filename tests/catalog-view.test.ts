import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePublicSnapshot } from "../src/lib/publish/snapshot.ts";
import { parseCatalogConfig } from "../src/lib/catalog/view.ts";

const UID = "11111111-1111-4111-8111-111111111111";
const SUPA = "https://proj.supabase.co";
const ID1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const p = (n: string) => `${UID}/catalog/${n}.webp`;

function snap(over: Record<string, unknown> = {}, config: unknown = { catalog: { enabled: true, title: "Karya" } }) {
  return {
    profile: { username: "rina", display_name: "Rina", bio: "", avatar_path: null },
    background_path: null,
    config,
    links: [],
    version: 3,
    published_at: "2026-10-18T00:00:00Z",
    catalog: [
      {
        id: ID1, title: "Paket Foto 📸", summary: "Ringkas", description: "Baris 1\nBaris 2", price_amount: 1500000, price_label: "Mulai dari",
        cta_type: "whatsapp", cta_label: null, cta_value: "6281234567890", cta_message: null,
        cover: p("f2"),
        images: [{ path: p("f1"), thumb: p("f1-t"), w: 1600, h: 1200 }, { path: p("f2"), thumb: p("f2-t"), w: 1200, h: 1200 }],
      },
      { id: ID2, title: "Tanpa Foto", summary: null, description: null, price_amount: null, price_label: "Hubungi untuk harga", cta_type: null, cta_value: null, cover: null, images: [] },
    ],
    ...over,
  };
}

test("snapshot -> katalog tampilan: judul section, harga, cover, URL publik, CTA", () => {
  const page = parsePublicSnapshot(snap(), SUPA);
  const cat = page?.view.catalog;
  assert.ok(cat);
  assert.equal(cat.title, "Karya");
  assert.equal(cat.items.length, 2);
  const a = cat.items[0]!;
  assert.equal(a.title, "Paket Foto 📸");
  assert.equal(a.price, "Mulai dari Rp 1.500.000");
  assert.equal(a.coverIndex, 1);
  assert.equal(a.images[0]!.url, `${SUPA}/storage/v1/object/public/public-assets/${p("f1")}`);
  assert.equal(a.images[0]!.thumbUrl, `${SUPA}/storage/v1/object/public/public-assets/${p("f1-t")}`);
  assert.ok(a.cta?.href.startsWith("https://wa.me/6281234567890?text="));
  assert.equal(a.cta?.label, "Tanya layanan ini");
  assert.ok(decodeURIComponent(a.cta!.href).includes("Paket Foto 📸") && decodeURIComponent(a.cta!.href).includes("rina"));
  const b = cat.items[1]!;
  assert.equal(b.price, "Hubungi untuk harga");
  assert.equal(b.cta, null, "tidak ada tujuan => tidak ada CTA");
  assert.equal(b.images.length, 0);
});

test("halaman tanpa katalog / katalog kosong / section nonaktif => tidak ada section", () => {
  assert.equal(parsePublicSnapshot(snap({ catalog: [] }), SUPA)?.view.catalog, null);
  const legacy = snap();
  delete (legacy as Record<string, unknown>).catalog;
  const p1 = parsePublicSnapshot(legacy, SUPA);
  assert.ok(p1, "snapshot lama tanpa kunci catalog tetap valid");
  assert.equal(p1?.view.catalog, null);
  assert.equal(parsePublicSnapshot(snap({}, { catalog: { enabled: false, title: "X" } }), SUPA)?.view.catalog, null);
  assert.equal(parsePublicSnapshot(snap({ catalog: "bukan array" }), SUPA)?.view.catalog, null);
  assert.equal(parsePublicSnapshot(snap({ catalog: [{ id: "bukan-uuid", title: "x" }, { id: ID1, title: "   " }] }), SUPA)?.view.catalog, null);
});

test("config tanpa pengaturan katalog: aktif dengan judul 'Layanan'", () => {
  assert.deepEqual(parseCatalogConfig({}), { enabled: true, title: "Layanan" });
  assert.deepEqual(parseCatalogConfig(null), { enabled: true, title: "Layanan" });
  assert.deepEqual(parseCatalogConfig({ catalog: { enabled: false, title: "" } }), { enabled: false, title: "Layanan" });
  assert.equal(parseCatalogConfig({ catalog: { title: "x".repeat(100) } }).title.length, 40);
  assert.equal(parseCatalogConfig({ catalog: { enabled: "ya" } }).enabled, true);
});

test("payload yang dimanipulasi tidak menghasilkan URL/CTA/HTML berbahaya", () => {
  const evil = snap({
    catalog: [{
      id: ID1, title: "<img src=x onerror=alert(1)>", summary: "<script>1</script>", description: "x",
      cta_type: "url", cta_value: "javascript:alert(1)", cover: "../../etc/passwd",
      images: [
        { path: "https://evil.test/x.png", thumb: "javascript:alert(1)" },
        { path: `${UID}/catalog/../../x.webp` },
        { path: `${UID}/catalog/x.svg` },
        { path: `${UID}/draft/x.webp` },
        { path: `${UID}/catalog/ok.webp`, thumb: `${UID}/catalog/ok-t.webp` },
      ],
    }],
  });
  const item = parsePublicSnapshot(evil, SUPA)?.view.catalog?.items[0];
  assert.ok(item);
  assert.equal(item.cta, null, "javascript: tidak pernah menjadi CTA");
  assert.equal(item.images.length, 1, "hanya path publik berpola baku yang lolos");
  assert.ok(item.images[0]!.url.startsWith(`${SUPA}/storage/v1/object/public/public-assets/`));
  // teks tetap string biasa (React me-escape saat render); tidak ada tag yang dieksekusi di level data
  assert.equal(typeof item.title, "string");
});

test("batas: maksimal 30 item dan 7 foto diterapkan lagi saat membaca snapshot", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Item ${i}`,
    images: Array.from({ length: 12 }, (_, k) => ({ path: p(`i${i}k${k}`), thumb: p(`i${i}k${k}-t`) })),
  }));
  const cat = parsePublicSnapshot(snap({ catalog: many }), SUPA)?.view.catalog;
  assert.equal(cat?.items.length, 30);
  assert.equal(cat?.items[0]?.images.length, 7);
});

test("tidak ada field internal/draft pada data tampilan katalog", () => {
  const json = JSON.stringify(parsePublicSnapshot(snap(), SUPA)?.view.catalog);
  for (const k of ["storage_path", "published_path", "owner_id", "draft", "signed", "token="]) assert.ok(!json.includes(k), k);
});
