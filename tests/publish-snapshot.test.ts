import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePublicSnapshot, publicAssetUrl } from "../src/lib/publish/snapshot.ts";

const UID = "11111111-2222-3333-4444-555555555555";
const SB = "https://abcdefgh.supabase.co";
const snap = (over: Record<string, unknown> = {}) => ({
  profile: { username: "nadia", display_name: "Nadia", bio: "Halo", avatar_path: `${UID}/avatar/a1.webp` },
  background_path: `${UID}/background/b1.webp`,
  config: { version: 1, settings: { radius: "sm", alignment: "left" } },
  links: [
    { id: "l1", title: "Toko", url: "https://toko.example", description: "Katalog", image_path: `${UID}/link/x.png`, config: { icon: "cart" } },
    { id: "l2", title: "Email", url: "mailto:a@b.co", description: null, image_path: null, config: {} },
  ],
  version: 3,
  published_at: "2026-10-17T00:00:00Z",
  ...over,
});

test("publicAssetUrl: hanya path berpola baku -> URL bucket publik", () => {
  assert.equal(publicAssetUrl(SB, `${UID}/avatar/a1.webp`), `${SB}/storage/v1/object/public/public-assets/${UID}/avatar/a1.webp`);
  for (const bad of [null, 5, "", "../etc/passwd", `${UID}/avatar/../x.png`, `${UID}/other/x.png`, `${UID}/avatar/x.svg`, "javascript:alert(1)", "https://evil.example/x.png", `${UID}/avatar/a b.png`, `${UID}/avatar/x.png?x=1`])
    assert.equal(publicAssetUrl(SB, bad), null, String(bad));
  assert.equal(publicAssetUrl("bukan-url", `${UID}/avatar/a.png`), null);
  assert.equal(publicAssetUrl("javascript:1", `${UID}/avatar/a.png`), null);
});

test("snapshot valid -> data tampilan lengkap", () => {
  const p = parsePublicSnapshot(snap(), SB);
  assert.ok(p);
  if (!p) return; // (penyempit tipe)
  assert.equal(p.username, "nadia");
  assert.equal(p.version, 3);
  assert.equal(p.view.displayName, "Nadia");
  assert.equal(p.view.settings.radius, "sm");
  assert.equal(p.view.settings.alignment, "left");
  assert.equal(p.view.links.length, 2);
  assert.equal(p.view.links[0]?.icon, "cart");
  assert.ok(p.view.links[0]?.imageUrl?.startsWith(`${SB}/storage/v1/object/public/public-assets/`));
  assert.equal(p.view.links[1]?.imageUrl, null);
  assert.ok(p.view.avatarUrl && p.view.backgroundUrl);
  assert.equal(p.meta.title, "Nadia (@nadia)");
  assert.equal(p.meta.description, "Halo");
  assert.equal(p.meta.imageUrl, p.view.avatarUrl);
});

test("URL link berbahaya di snapshot tidak pernah dirender (validasi ulang)", () => {
  const p = parsePublicSnapshot(
    snap({ links: [
      { id: "a", title: "Aman", url: "https://ok.example", config: {} },
      { id: "b", title: "XSS", url: "javascript:alert(1)", config: {} },
      { id: "c", title: "Data", url: "data:text/html,x", config: {} },
      { id: "d", title: "", url: "https://kosong.example", config: {} },
      { id: "", title: "TanpaId", url: "https://x.example", config: {} },
    ] }),
    SB,
  );
  assert.deepEqual(p?.view.links.map((l) => l.id), ["a"]);
});

test("payload rusak/asing tidak melempar dan dibersihkan", () => {
  assert.equal(parsePublicSnapshot(null, SB), null);
  assert.equal(parsePublicSnapshot("x", SB), null);
  assert.equal(parsePublicSnapshot({}, SB), null);
  assert.equal(parsePublicSnapshot({ profile: { username: "../x" } }, SB), null);
  const p = parsePublicSnapshot(snap({ config: "rusak", links: "bukan-array", background_path: "https://evil.example/x.png" }), SB);
  assert.ok(p);
  if (!p) return; // (penyempit tipe)
  assert.deepEqual(p.view.links, []);
  assert.equal(p.view.backgroundUrl, null);
  assert.equal(p.view.settings.radius, "lg"); // default
});

test("batas panjang dan jumlah link; nama kosong memakai username", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `l${i}`, title: "T", url: "https://x.example", config: {} }));
  const p = parsePublicSnapshot(snap({ links: many, profile: { username: "nadia", display_name: "   ", bio: "x".repeat(900) } }), SB);
  assert.equal(p?.view.links.length, 50);
  assert.equal(p?.view.displayName, "nadia");
  assert.equal(Array.from(p?.view.bio ?? "").length, 500);
  assert.ok((p?.meta.description.length ?? 0) <= 160);
});

test("tidak ada bidang internal yang bocor ke data tampilan", () => {
  const p = parsePublicSnapshot(snap({ owner_id: "rahasia", profile: { username: "nadia", display_name: "N", owner_id: "rahasia", avatar_path: null } }), SB);
  assert.ok(!JSON.stringify(p).includes("rahasia"));
});
