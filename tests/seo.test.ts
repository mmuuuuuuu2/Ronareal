import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPageMetadata } from "../src/lib/seo/metadata.ts";
import { DEFAULT_SEO, SEO_LIMITS, parseSeoFromConfig, resolveMeta, sameSeo, sanitizeSeo, validateSeo } from "../src/lib/seo/seo.ts";
import { parsePublicSnapshot } from "../src/lib/publish/snapshot.ts";

const UID = "11111111-2222-3333-4444-555555555555";
const SB = "https://abcdefgh.supabase.co";
const sql = readFileSync(new URL("../supabase/migrations/20261021000000_phase7_account_page_settings.sql", import.meta.url), "utf8");

test("batas SEO di TS identik dengan save_seo() di migration", () => {
  assert.match(sql, /char_length\(coalesce\(v_title, ''\)\) > 70 or char_length\(coalesce\(v_og_title, ''\)\) > 70/);
  assert.match(sql, /coalesce\(v_desc, ''\)\) > 160 or char_length\(coalesce\(v_og_desc, ''\)\) > 200/);
  assert.deepEqual(SEO_LIMITS, { title: 70, description: 160, ogTitle: 70, ogDescription: 200 });
  assert.match(sql, /not in \('avatar', 'background', 'none'\)/);
  assert.match(sql, /not in \('summary', 'summary_large_image'\)/);
});

test("sanitizeSeo: data rusak -> default, tidak pernah undefined/null string", () => {
  for (const raw of [null, undefined, 5, [], "x", { title: null, description: undefined, ogImage: "http://evil", twitterCard: "player" }]) {
    const s = sanitizeSeo(raw);
    assert.deepEqual(s, DEFAULT_SEO);
  }
  assert.equal(sanitizeSeo({ title: "  a   b  " }).title, "a b");
  assert.equal(sanitizeSeo({ title: "x".repeat(200) }).title.length, 70);
  assert.equal(sanitizeSeo({ title: "a\u0007b" }).title, "");
});

test("validateSeo: batas, enum, karakter kontrol", () => {
  assert.equal(validateSeo({ title: "ok" }).ok, true);
  const r = validateSeo({ title: "x".repeat(71), description: "y".repeat(161), ogImage: "http://x", twitterCard: "player" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["description", "ogImage", "title", "twitterCard"]);
  assert.equal(validateSeo({ title: "a\u0000b" }).ok, false);
  assert.equal(validateSeo(null).ok, true); // kosong = semua bawaan
});

test("resolveMeta: default masuk akal, tanpa 'undefined'/'null'", () => {
  const m = resolveMeta({ seo: DEFAULT_SEO, username: "rona", displayName: "", bio: "", avatarUrl: null, backgroundUrl: null });
  assert.equal(m.title, "rona (@rona)");
  assert.match(m.description, /Halaman tautan rona/);
  for (const v of Object.values(m)) if (v !== null) assert.doesNotMatch(String(v), /undefined|null/);
  const c = resolveMeta({ seo: { ...DEFAULT_SEO, title: "T", ogDescription: "D" }, username: "rona", displayName: "Rona", bio: "bio saya", avatarUrl: "https://a/x.png", backgroundUrl: null });
  assert.equal(c.title, "T");
  assert.equal(c.ogTitle, "T");
  assert.equal(c.description, "bio saya");
  assert.equal(c.ogDescription, "D");
  assert.equal(c.imageUrl, "https://a/x.png");
});

test("kartu besar tanpa gambar turun ke summary; ogImage=none menghilangkan gambar", () => {
  const base = { username: "rona", displayName: "R", bio: "", avatarUrl: "https://a/x.png", backgroundUrl: null };
  assert.equal(resolveMeta({ ...base, seo: { ...DEFAULT_SEO, twitterCard: "summary_large_image" } }).twitterCard, "summary_large_image");
  const none = resolveMeta({ ...base, seo: { ...DEFAULT_SEO, ogImage: "none", twitterCard: "summary_large_image" } });
  assert.equal(none.imageUrl, null);
  assert.equal(none.twitterCard, "summary");
});

test("sameSeo & parseSeoFromConfig", () => {
  assert.equal(sameSeo(DEFAULT_SEO, { ...DEFAULT_SEO }), true);
  assert.equal(sameSeo(DEFAULT_SEO, { ...DEFAULT_SEO, title: "x" }), false);
  assert.equal(parseSeoFromConfig({ seo: { title: "Hai" }, settings: {} }).title, "Hai");
  assert.deepEqual(parseSeoFromConfig(null), DEFAULT_SEO);
});

const snap = (over: Record<string, unknown> = {}) => ({
  profile: { username: "rona", display_name: "Rona", bio: "Bio", avatar_path: `${UID}/avatar/a.png` },
  background_path: `${UID}/background/b.jpg`,
  config: { seo: { title: "Judul SEO", ogImage: "background", twitterCard: "summary_large_image" } },
  links: [{ id: "1", title: "L", url: "https://x.example", config: {} }],
  ...over,
});

test("snapshot -> meta memakai SEO dari data TERBIT; gambar hanya dari aset publik", () => {
  const p = parsePublicSnapshot(snap(), SB);
  assert.ok(p);
  assert.equal(p.meta.title, "Judul SEO");
  assert.equal(p.meta.imageUrl, `${SB}/storage/v1/object/public/public-assets/${UID}/background/b.jpg`);
  assert.equal(p.meta.twitterCard, "summary_large_image");
  // path di luar pola (mis. draft/URL bebas) tidak pernah jadi gambar
  const bad = parsePublicSnapshot(snap({ config: { seo: { ogImage: "avatar" } }, profile: { username: "rona", display_name: "R", avatar_path: "https://evil.example/x.png" } }), SB);
  assert.equal(bad?.meta.imageUrl, null);
});

test("buildPageMetadata: canonical dari origin tepercaya; tanpa origin -> relatif; tidak ada 'undefined'", () => {
  const p = parsePublicSnapshot(snap(), SB)!;
  const m = buildPageMetadata(p, "https://rona.example");
  assert.equal(m.alternates?.canonical, "https://rona.example/rona");
  assert.equal((m.openGraph as { url: string }).url, "https://rona.example/rona");
  assert.equal((m.twitter as { card: string }).card, "summary_large_image");
  assert.equal(buildPageMetadata(p, null).alternates?.canonical, "/rona");
  assert.doesNotMatch(JSON.stringify(m), /undefined|"null"/);
  const noSeo = parsePublicSnapshot(snap({ config: {} }), SB)!;
  assert.equal(noSeo.meta.title, "Rona (@rona)");
});

test("dua username berbeda tidak berbagi metadata", () => {
  const a = buildPageMetadata(parsePublicSnapshot(snap(), SB)!, "https://rona.example");
  const b = buildPageMetadata(parsePublicSnapshot(snap({ profile: { username: "budi", display_name: "Budi" }, config: {} }), SB)!, "https://rona.example");
  assert.equal(b.alternates?.canonical, "https://rona.example/budi");
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});
