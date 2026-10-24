import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAddItem, canAddPhoto, catalogReducer, initialCatalogState, isCatalogDirty, isItemDirty, isNewItem, toCatalogPreview,
  type CatalogEditorState, type EditorCatalogItem, type EditorPhoto,
} from "../src/lib/catalog/state.ts";
import { MAX_ITEMS_PER_PAGE, MAX_PHOTOS_PER_ITEM } from "../src/lib/catalog/item.ts";

const photo = (n: number): EditorPhoto => ({ id: `p${n}`, path: `u/catalog/${n}.webp`, thumbPath: `u/catalog/${n}-t.webp`, url: `https://signed.test/${n}`, thumbUrl: `https://signed.test/${n}t`, width: 800, height: 800 });
const start = (items: EditorCatalogItem[] = []) => initialCatalogState({ enabled: true, title: "", items });
const ctx = { username: "rina", displayName: "Rina" };
const add = (s: CatalogEditorState) => catalogReducer(s, { type: "item/add" });

test("section: default 'Layanan', aktif/nonaktif, dirty", () => {
  let s = start();
  assert.equal(s.title, "Layanan");
  assert.equal(isCatalogDirty(s), false);
  s = catalogReducer(s, { type: "settings/set", patch: { title: "Portofolio" } });
  assert.equal(isCatalogDirty(s), true);
  s = catalogReducer(s, { type: "settings/saved", enabled: true, title: "Portofolio" });
  assert.equal(isCatalogDirty(s), false);
  s = catalogReducer(s, { type: "settings/set", patch: { enabled: false } });
  assert.equal(isCatalogDirty(s), true);
});

test("tambah, edit, simpan, buang item", () => {
  let s = add(start());
  const id = s.items[0]!.id;
  assert.ok(isNewItem(s.items[0]!));
  s = catalogReducer(s, { type: "item/edit", id, patch: { title: "Paket A", summary: "x" } });
  assert.equal(s.items[0]!.fields.title, "Paket A");
  assert.ok(isItemDirty(s.items[0]!));
  s = catalogReducer(s, { type: "item/saved", id, newId: "db-1", fields: s.items[0]!.fields });
  assert.equal(s.items[0]!.id, "db-1");
  assert.equal(isItemDirty(s.items[0]!), false);
  s = catalogReducer(s, { type: "item/edit", id: "db-1", patch: { title: "Paket B" } });
  assert.ok(isItemDirty(s.items[0]!));
  s = catalogReducer(s, { type: "item/discard", id: "db-1" });
  assert.equal(s.items[0]!.fields.title, "Paket A");
  s = add(s);
  s = catalogReducer(s, { type: "item/discard", id: s.items[1]!.id });
  assert.equal(s.items.length, 1, "item baru yang dibuang hilang");
  s = catalogReducer(s, { type: "item/remove", id: "db-1" });
  assert.equal(s.items.length, 0);
});

test("galat simpan: draft di layar dipertahankan, edit berikutnya menghapus galat", () => {
  let s = add(start());
  const id = s.items[0]!.id;
  s = catalogReducer(s, { type: "item/edit", id, patch: { title: "Aku" } });
  s = catalogReducer(s, { type: "item/failed", id, message: "gagal", fieldErrors: { ctaValue: "salah" } });
  assert.equal(s.items[0]!.status, "error");
  assert.equal(s.items[0]!.fields.title, "Aku");
  s = catalogReducer(s, { type: "item/edit", id, patch: { ctaValue: "x" } });
  assert.equal(s.items[0]!.status, "idle");
  assert.equal(s.items[0]!.fieldErrors, undefined);
});

test("batas 30 item dan 7 foto di UI", () => {
  let s = start();
  for (let i = 0; i < MAX_ITEMS_PER_PAGE + 5; i++) s = add(s);
  assert.equal(s.items.length, MAX_ITEMS_PER_PAGE);
  assert.equal(canAddItem(s), false);
  const item = { ...s.items[0]!, id: "db" };
  assert.equal(canAddPhoto({ ...item, photos: [] }), true);
  assert.equal(canAddPhoto({ ...item, photos: Array.from({ length: MAX_PHOTOS_PER_ITEM }, (_, i) => photo(i)) }), false);
  assert.equal(canAddPhoto({ ...item, id: "new:1", photos: [] }), false, "foto hanya setelah item tersimpan");
  const over = catalogReducer(s, { type: "item/photos", id: s.items[0]!.id, photos: Array.from({ length: 10 }, (_, i) => photo(i)), coverId: "p0" });
  assert.equal(over.items[0]!.photos.length, MAX_PHOTOS_PER_ITEM);
});

test("urutan item: geser naik/turun, batas tepi", () => {
  let s = start();
  s = add(s); s = add(s); s = add(s);
  const ids = s.items.map((i) => i.id);
  s = catalogReducer(s, { type: "items/move", id: ids[2]!, direction: -1 });
  assert.deepEqual(s.items.map((i) => i.id), [ids[0], ids[2], ids[1]]);
  const same = catalogReducer(s, { type: "items/move", id: ids[0]!, direction: -1 });
  assert.equal(same, s);
});

test("preview draft: item nonaktif/tanpa judul tidak tampil; cover mengikuti pilihan; CTA tidak valid disembunyikan", () => {
  let s = start();
  s = add(s); s = add(s); s = add(s);
  const [a, b, c] = s.items.map((i) => i.id) as [string, string, string];
  s = catalogReducer(s, { type: "item/edit", id: a, patch: { title: "Layanan A", priceAmount: "1.500.000", priceLabel: "Mulai dari", ctaType: "whatsapp", ctaValue: "0812 3456 7890" } });
  s = catalogReducer(s, { type: "item/photos", id: a, photos: [photo(1), photo(2), photo(3)], coverId: "p2" });
  s = catalogReducer(s, { type: "item/edit", id: b, patch: { title: "Layanan B", ctaType: "url", ctaValue: "javascript:alert(1)" } });
  s = catalogReducer(s, { type: "item/edit", id: c, patch: { title: "Tersembunyi" } });
  s = catalogReducer(s, { type: "item/visible", id: c, value: false });
  const view = toCatalogPreview(s, ctx);
  assert.ok(view);
  assert.equal(view.title, "Layanan");
  assert.deepEqual(view.items.map((i) => i.title), ["Layanan A", "Layanan B"]);
  assert.equal(view.items[0]!.coverIndex, 1);
  assert.equal(view.items[0]!.price, "Mulai dari Rp 1.500.000");
  assert.ok(view.items[0]!.cta?.href.startsWith("https://wa.me/6281234567890"));
  assert.equal(view.items[1]!.cta, null, "CTA berbahaya tidak muncul bahkan di preview");
  // draft belum punya URL publik: hanya URL bertanda tangan sementara untuk tampilan editor
  assert.ok(view.items[0]!.images[0]!.url.startsWith("https://signed.test/"));
});

test("preview: section nonaktif / tanpa item = tidak ada section", () => {
  let s = add(start());
  s = catalogReducer(s, { type: "item/edit", id: s.items[0]!.id, patch: { title: "A" } });
  assert.ok(toCatalogPreview(s, ctx));
  assert.equal(toCatalogPreview(catalogReducer(s, { type: "settings/set", patch: { enabled: false } }), ctx), null);
  assert.equal(toCatalogPreview(start(), ctx), null);
  assert.equal(toCatalogPreview(add(start()), ctx), null, "item tanpa judul tidak tampil");
});

test("foto ditambah satu per satu: sampul otomatis = foto pertama, batas 7, tidak ganda", () => {
  let s = add(start());
  const id = s.items[0]!.id;
  s = catalogReducer(s, { type: "item/photoAdd", id, photo: photo(1), coverId: "p1" });
  s = catalogReducer(s, { type: "item/photoAdd", id, photo: photo(2), coverId: "p1" });
  assert.equal(s.items[0]!.coverId, "p1");
  s = catalogReducer(s, { type: "item/photoAdd", id, photo: photo(2), coverId: "p1" });
  assert.equal(s.items[0]!.photos.length, 2, "foto yang sama tidak ditambahkan dua kali");
  for (let i = 3; i <= 12; i++) s = catalogReducer(s, { type: "item/photoAdd", id, photo: photo(i), coverId: "p1" });
  assert.equal(s.items[0]!.photos.length, MAX_PHOTOS_PER_ITEM);
});
