import assert from "node:assert/strict";
import { test } from "node:test";
import { LINK_DESCRIPTION_MAX, LINK_TITLE_MAX, MAX_LINKS_PER_PAGE, validateLink } from "../src/lib/validation/link.ts";

test("link valid dirapikan", () => {
  const r = validateLink({ title: "  Toko Saya ", url: "toko.com/produk", description: " Katalog ", icon: "cart" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { title: "Toko Saya", url: "https://toko.com/produk", description: "Katalog", icon: "cart" });
});

test("deskripsi dan ikon opsional", () => {
  const r = validateLink({ title: "A", url: "https://a.com" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { title: "A", url: "https://a.com", description: "", icon: null });
});

test("judul dan URL wajib; skema berbahaya ditolak", () => {
  const r = validateLink({ title: "  ", url: "javascript:alert(1)" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.title);
    assert.ok(r.errors.url);
  }
});

test("batas panjang sama dengan constraint database", () => {
  assert.equal(LINK_TITLE_MAX, 120);
  assert.equal(LINK_DESCRIPTION_MAX, 300);
  assert.equal(MAX_LINKS_PER_PAGE, 50);
  assert.equal(validateLink({ title: "a".repeat(120), url: "https://a.com" }).ok, true);
  assert.equal(validateLink({ title: "a".repeat(121), url: "https://a.com" }).ok, false);
  assert.equal(validateLink({ title: "a", url: "https://a.com", description: "d".repeat(301) }).ok, false);
});

test("karakter kontrol dan ikon tak dikenal ditolak", () => {
  assert.equal(validateLink({ title: "a\u0007b", url: "https://a.com" }).ok, false);
  assert.equal(validateLink({ title: "a", url: "https://a.com", icon: "bom" }).ok, false);
  assert.equal(validateLink({ title: 5, url: "https://a.com" }).ok, false);
});
