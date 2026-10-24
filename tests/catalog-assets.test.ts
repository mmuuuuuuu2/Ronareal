import assert from "node:assert/strict";
import { test } from "node:test";
import { planAssetSync, type AssetSources } from "../src/lib/publish/assets.ts";
import { buildCatalogPath, fitWithin, isOwnedCatalogPath, planPhotoBatch, validateCatalogUpload } from "../src/lib/catalog/images.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const base = (catalog: AssetSources["catalog"]): AssetSources => ({
  uid: A, avatar: { path: null, publishedPath: null }, background: { path: null, publishedPath: null }, links: [], catalog,
});
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");

test("rencana publish: hanya foto & thumbnail item tampil yang disalin; yang sudah tersalin dilewati", () => {
  const plan = planAssetSync(base([
    { isVisible: true, images: [
      { path: `${A}/catalog/a.webp`, thumbPath: `${A}/catalog/a-t.webp`, publishedPath: null, thumbPublishedPath: null },
      { path: `${A}/catalog/b.webp`, thumbPath: `${A}/catalog/b-t.webp`, publishedPath: `${A}/catalog/b.webp`, thumbPublishedPath: `${A}/catalog/b-t.webp` },
    ] },
    { isVisible: false, images: [{ path: `${A}/catalog/h.webp`, thumbPath: null, publishedPath: null, thumbPublishedPath: null }] },
  ]));
  assert.ok(plan.ok);
  if (plan.ok) assert.deepEqual(plan.copies.map((c) => c.path), [`${A}/catalog/a.webp`, `${A}/catalog/a-t.webp`]);
});

test("mengedit teks item tidak menyalin ulang aset (semua sudah tersalin => nol salinan)", () => {
  const same = { path: `${A}/catalog/a.webp`, thumbPath: `${A}/catalog/a-t.webp`, publishedPath: `${A}/catalog/a.webp`, thumbPublishedPath: `${A}/catalog/a-t.webp` };
  const plan = planAssetSync(base([{ isVisible: true, images: [same] }]));
  assert.ok(plan.ok && plan.copies.length === 0);
});

test("path foto milik akun lain / tidak berpola ditolak (server tidak menyalin file arbitrer)", () => {
  for (const path of [`${B}/catalog/x.webp`, `${A}/avatar/x.webp`, `${A}/catalog/../x.webp`, `${A}/catalog/x.svg`, "x.webp", `${A}/catalog/sub/x.webp`]) {
    const plan = planAssetSync(base([{ isVisible: true, images: [{ path, thumbPath: null, publishedPath: null, thumbPublishedPath: null }] }]));
    assert.equal(plan.ok, false, path);
  }
  const t = planAssetSync(base([{ isVisible: true, images: [{ path: `${A}/catalog/x.webp`, thumbPath: `${B}/catalog/t.webp`, publishedPath: null, thumbPublishedPath: null }] }]));
  assert.equal(t.ok, false);
});

test("item nonaktif dengan path rusak tidak menggagalkan publish (tidak ikut terbit)", () => {
  const plan = planAssetSync(base([{ isVisible: false, images: [{ path: `${B}/catalog/x.webp`, thumbPath: null, publishedPath: null, thumbPublishedPath: null }] }]));
  assert.ok(plan.ok);
});

test("tanpa katalog: perilaku Phase 4 tidak berubah", () => {
  const plan = planAssetSync({ uid: A, avatar: { path: null, publishedPath: null }, background: { path: null, publishedPath: null }, links: [] });
  assert.ok(plan.ok && plan.copies.length === 0);
});

test("path builder & pemilik", () => {
  assert.equal(buildCatalogPath(A, "image/webp", "abc12345", "full"), `${A}/catalog/abc12345.webp`);
  assert.equal(buildCatalogPath(A, "image/jpeg", "abc12345", "thumb"), `${A}/catalog/abc12345-t.jpg`);
  assert.throws(() => buildCatalogPath("bukan-uuid", "image/webp", "abc12345", "full"));
  assert.throws(() => buildCatalogPath(A, "image/webp", "../x", "full"));
  assert.ok(isOwnedCatalogPath(`${A}/catalog/abc-t.webp`, A));
  assert.ok(!isOwnedCatalogPath(`${A}/catalog/abc.webp`, B));
  assert.ok(!isOwnedCatalogPath(`${A}/link/abc.webp`, A));
  assert.ok(!isOwnedCatalogPath(null, A));
});

test("batas 7 foto per item (perencanaan batch unggahan)", () => {
  assert.deepEqual(planPhotoBatch(0, 3), { accept: 3, rejected: 0, full: false });
  assert.deepEqual(planPhotoBatch(5, 4), { accept: 2, rejected: 2, full: false });
  assert.deepEqual(planPhotoBatch(7, 1), { accept: 0, rejected: 1, full: true });
  assert.deepEqual(planPhotoBatch(9, 1), { accept: 0, rejected: 1, full: true });
});

test("fitWithin: mengecilkan tanpa memperbesar", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.throws(() => fitWithin(0, 10, 100));
});

test("validasi unggahan server: magic bytes, SVG/HTML ditolak, MIME palsu ditolak", () => {
  const ok = validateCatalogUpload({ full: webp, fullMime: "image/webp", thumb: png, thumbMime: "image/png", width: 1600, height: "1200" });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.fullMime, ok.thumbMime, ok.width, ok.height], ["image/webp", "image/png", 1600, 1200]);
  assert.equal(validateCatalogUpload({ full: svg, fullMime: "image/png", thumb: null, thumbMime: null, width: 1, height: 1 }).ok, false);
  assert.equal(validateCatalogUpload({ full: svg, fullMime: "image/svg+xml", thumb: null, thumbMime: null, width: 1, height: 1 }).ok, false);
  assert.equal(validateCatalogUpload({ full: html, fullMime: "image/jpeg", thumb: null, thumbMime: null, width: 1, height: 1 }).ok, false);
  assert.equal(validateCatalogUpload({ full: png, fullMime: "image/webp", thumb: null, thumbMime: null, width: 1, height: 1 }).ok, false, "MIME tidak sesuai isi");
  assert.equal(validateCatalogUpload({ full: new Uint8Array(0), fullMime: "image/png", thumb: null, thumbMime: null, width: 1, height: 1 }).ok, false);
  assert.equal(validateCatalogUpload({ full: png, fullMime: "image/png", thumb: svg, thumbMime: "image/png", width: 1, height: 1 }).ok, false, "thumbnail SVG ditolak");
  const big = new Uint8Array(600 * 1024); big.set(png);
  assert.equal(validateCatalogUpload({ full: png, fullMime: "image/png", thumb: big, thumbMime: "image/png", width: 1, height: 1 }).ok, false, "thumbnail terlalu besar");
  const bigFull = new Uint8Array(5 * 1024 * 1024 + 1); bigFull.set(png);
  assert.equal(validateCatalogUpload({ full: bigFull, fullMime: "image/png", thumb: null, thumbMime: null, width: 1, height: 1 }).ok, false, "> 5 MB ditolak");
  const dims = validateCatalogUpload({ full: png, fullMime: "image/png", thumb: null, thumbMime: null, width: -5, height: 99999 });
  assert.ok(dims.ok && dims.width === null && dims.height === null, "dimensi liar dibuang");
});
