import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, formatPrice, formatRupiah, parsePrice, validateItem, validateSectionTitle, valueToFields } from "../src/lib/catalog/item.ts";

test("item valid minimal: hanya judul", () => {
  const v = validateItem({ title: "  Paket Pernikahan  " });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.value.title, "Paket Pernikahan");
    assert.equal(v.value.summary, null);
    assert.equal(v.value.priceAmount, null);
    assert.equal(v.value.ctaType, null);
    assert.equal(v.value.ctaValue, null);
  }
});

test("Unicode, emoji, dan Bahasa Indonesia dipertahankan; panjang dihitung per code point", () => {
  const title = "Jasa Foto 📸 Pernikahan — Café Ñandú 😀".normalize("NFC");
  const v = validateItem({ title, summary: "Ringkas 🎉", description: "Baris satu\nBaris dua é" });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.value.title, title);
    assert.equal(v.value.description, "Baris satu\nBaris dua é");
  }
  assert.ok(validateItem({ title: "😀".repeat(120) }).ok, "120 emoji = 120 karakter");
  assert.ok(!validateItem({ title: "😀".repeat(121) }).ok);
});

test("batas panjang ditegakkan di validator (server)", () => {
  const e = (o: object) => { const v = validateItem({ title: "x", ...o }); return v.ok ? {} : v.errors; };
  assert.ok("title" in e({ title: "" }));
  assert.ok("title" in e({ title: "x".repeat(121) }));
  assert.ok("summary" in e({ summary: "x".repeat(161) }));
  assert.ok("description" in e({ description: "x".repeat(2001) }));
  assert.ok("priceLabel" in e({ priceLabel: "x".repeat(41) }));
  assert.ok("ctaLabel" in e({ ctaLabel: "x".repeat(61) }));
  assert.ok("ctaMessage" in e({ ctaMessage: "x".repeat(1001) }));
  assert.deepEqual(e({}), {});
});

test("karakter kontrol dibuang; judul tidak bisa multibaris", () => {
  const v = validateItem({ title: "A\u0000B\nC\u0007", description: "x\u0000y\nz" });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.value.title, "AB C");
    assert.equal(v.value.description, "xy\nz");
  }
  assert.ok(!validateItem({ title: "\u0000\u0007  " }).ok);
});

test("input non-string / bukan objek ditolak aman", () => {
  assert.ok(!validateItem(null).ok);
  assert.ok(!validateItem({ title: 123 }).ok);
  assert.ok(!validateItem({ title: "x", summary: {} }).ok);
  assert.ok(!validateItem({ title: "x", ctaType: "javascript", ctaValue: "alert(1)" }).ok);
});

test("harga: format Indonesia, desimal/negatif/huruf ditolak", () => {
  for (const [raw, n] of [["1500000", 1500000], ["1.500.000", 1500000], ["1,500,000", 1500000], ["Rp 750.000", 750000], ["0", 0], ["", null], [null, null], [undefined, null]] as const) {
    const r = parsePrice(raw);
    assert.ok(r.ok && r.value === n, String(raw));
  }
  for (const bad of ["-5", "12,50", "1.5", "abc", "1e6", "99999999999999999999", "1.50.000", "Rp"]) {
    const r = parsePrice(bad);
    assert.ok(!(r.ok && r.value !== null && bad !== "Rp"), bad);
  }
  assert.ok(!parsePrice("-5").ok);
  assert.ok(!parsePrice("1e6").ok);
  assert.ok(!parsePrice(1.5).ok);
  assert.ok(!parsePrice(1_000_000_000_000).ok);
  assert.equal(formatRupiah(1500000), "Rp 1.500.000");
  assert.equal(formatRupiah(0), "Rp 0");
  assert.equal(formatPrice(1500000, "Mulai dari"), "Mulai dari Rp 1.500.000");
  assert.equal(formatPrice(500, null), "Rp 500");
  assert.equal(formatPrice(null, "Hubungi untuk harga"), "Hubungi untuk harga");
  assert.equal(formatPrice(null, null), null);
});

test("CTA pada validateItem: pasangan jenis+nilai, normalisasi, tanpa menimpa label/template", () => {
  const ok = validateItem({ title: "x", ctaType: "whatsapp", ctaValue: "0812-3456-7890", ctaLabel: "Pesan sekarang", ctaMessage: "Halo {judul}" });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.ctaValue, "6281234567890");
    assert.equal(ok.value.ctaLabel, "Pesan sekarang");
    assert.equal(ok.value.ctaMessage, "Halo {judul}");
  }
  const noType = validateItem({ title: "x", ctaValue: "https://a.test" });
  assert.ok(!noType.ok && "ctaType" in noType.errors);
  const noValue = validateItem({ title: "x", ctaType: "url", ctaValue: "  " });
  assert.ok(!noValue.ok && "ctaValue" in noValue.errors);
  const evil = validateItem({ title: "x", ctaType: "url", ctaValue: "javascript:alert(1)" });
  assert.ok(!evil.ok && "ctaValue" in evil.errors);
  const none = validateItem({ title: "x", ctaType: "", ctaValue: "", ctaLabel: "Tetap tersimpan" });
  assert.ok(none.ok);
  if (none.ok) {
    assert.equal(none.value.ctaType, null);
    assert.equal(none.value.ctaLabel, "Tetap tersimpan");
  }
  const empty = validateItem({ title: "x", ctaLabel: "" });
  assert.ok(empty.ok && empty.value.ctaLabel === null);
});

test("judul section: wajib, maks 40, default dikelola pemanggil", () => {
  assert.ok(validateSectionTitle("Karya Saya").ok);
  assert.ok(!validateSectionTitle("   ").ok);
  assert.ok(!validateSectionTitle("x".repeat(41)).ok);
  assert.ok(validateSectionTitle("Portofolio 🎨").ok);
});

test("cleanText & valueToFields", () => {
  assert.deepEqual(cleanText(undefined, 5, "x"), { ok: true, value: "" });
  assert.equal(cleanText("abcdef", 5, "Teks").ok, false);
  const f = valueToFields({ title: "T", summary: null, description: "D", price_amount: 1500, price_label: "Paket", cta_type: "url", cta_value: "https://a.test", cta_label: null, cta_message: null });
  assert.equal(f.priceAmount, "1500");
  assert.equal(f.ctaType, "url");
  assert.equal(f.summary, "");
  assert.equal(valueToFields({ title: "T", summary: null, description: null, price_amount: null, price_label: null, cta_type: "aneh", cta_value: null, cta_label: null, cta_message: null }).ctaType, "");
});
