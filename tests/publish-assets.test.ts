import assert from "node:assert/strict";
import { test } from "node:test";
import { planAssetSync, type AssetSources } from "../src/lib/publish/assets.ts";
import { validatePublishable } from "../src/lib/publish/validate.ts";

const UID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const base = (over: Partial<AssetSources> = {}): AssetSources => ({
  uid: UID,
  avatar: { path: `${UID}/avatar/a.webp`, publishedPath: null },
  background: { path: null, publishedPath: null },
  links: [
    { id: "l1", isVisible: true, path: `${UID}/link/x.webp`, publishedPath: null },
    { id: "l2", isVisible: false, path: `${UID}/link/hidden.webp`, publishedPath: null },
    { id: "l3", isVisible: true, path: null, publishedPath: null },
  ],
  ...over,
});

test("menyalin hanya aset yang dibutuhkan (tersembunyi dan tanpa gambar diabaikan)", () => {
  const p = planAssetSync(base());
  assert.ok(p.ok);
  if (p.ok) {
    assert.deepEqual(p.copies.map((c) => c.path), [`${UID}/avatar/a.webp`, `${UID}/link/x.webp`]);
    assert.deepEqual(p.rpc, { p_avatar: `${UID}/avatar/a.webp`, p_background: null, p_links: { l1: `${UID}/link/x.webp` } });
  }
});

test("aset yang sudah punya salinan publik yang sama tidak disalin ulang (hemat egress)", () => {
  const p = planAssetSync(base({ avatar: { path: `${UID}/avatar/a.webp`, publishedPath: `${UID}/avatar/a.webp` } }));
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.copies.map((c) => c.path), [`${UID}/link/x.webp`]);
});

test("gambar yang diganti (path publik lama berbeda) disalin lagi", () => {
  const p = planAssetSync(base({ avatar: { path: `${UID}/avatar/baru.webp`, publishedPath: `${UID}/avatar/lama.webp` } }));
  assert.ok(p.ok);
  if (p.ok) assert.ok(p.copies.some((c) => c.path === `${UID}/avatar/baru.webp`));
});

test("path milik pengguna lain, jenis salah, atau traversal ditolak", () => {
  for (const bad of [`${OTHER}/avatar/a.webp`, `${UID}/link/a.webp`, `${UID}/avatar/../../${OTHER}/avatar/a.webp`, `${UID}/avatar/a.svg`, "x"]) {
    assert.equal(planAssetSync(base({ avatar: { path: bad, publishedPath: null } })).ok, false, bad);
  }
  assert.equal(planAssetSync(base({ background: { path: `${UID}/avatar/a.webp`, publishedPath: null } })).ok, false);
  assert.equal(planAssetSync(base({ links: [{ id: "l", isVisible: true, path: `${OTHER}/link/x.webp`, publishedPath: null }] })).ok, false);
});

test("link tersembunyi dengan path asing tidak memblokir (tidak ikut terbit)", () => {
  const p = planAssetSync(base({ links: [{ id: "h", isVisible: false, path: `${OTHER}/link/x.webp`, publishedPath: null }] }));
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.rpc.p_links, {});
});

const ok = { username: "nadia", displayName: "Nadia", links: [{ title: "A", url: "https://a.example", isVisible: true }] };
test("validatePublishable: layak, tanpa link aktif, URL buruk, nama kosong", () => {
  assert.equal(validatePublishable(ok).ok, true);
  assert.equal(validatePublishable({ ...ok, links: [{ title: "A", url: "https://a.example", isVisible: false }] }).ok, false);
  const bad = validatePublishable({ ...ok, links: [{ title: "A", url: "javascript:alert(1)", isVisible: true }] });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.problems.join(" "), /Tautan 1/);
  assert.equal(validatePublishable({ ...ok, displayName: "  " }).ok, false);
  assert.equal(validatePublishable({ ...ok, username: "-x-" }).ok, false);
  // tautan nonaktif yang URL-nya buruk tidak menghalangi terbit
  assert.equal(validatePublishable({ ...ok, links: [...ok.links, { title: "B", url: "javascript:x", isVisible: false }] }).ok, true);
});
