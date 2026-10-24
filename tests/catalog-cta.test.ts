import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CTA_LABEL, DEFAULT_WA_TEMPLATE, buildCtaHref, normalizeCtaValue, normalizeWhatsapp, renderMessageTemplate, resolveCta,
} from "../src/lib/catalog/cta.ts";

const ctx = { title: "Paket Foto 📸", username: "rina", displayName: "Rina" };

test("normalizeWhatsapp: format Indonesia & internasional", () => {
  assert.equal(normalizeWhatsapp("0812-3456-7890"), "6281234567890");
  assert.equal(normalizeWhatsapp("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizeWhatsapp("0062 812 3456 7890"), "6281234567890");
  assert.equal(normalizeWhatsapp("(021) 5551234"), "62215551234");
  assert.equal(normalizeWhatsapp("abc"), null);
  assert.equal(normalizeWhatsapp("12345"), null);
  assert.equal(normalizeWhatsapp("+0812"), null);
  assert.equal(normalizeWhatsapp("javascript:alert(1)"), null);
});

test("normalizeCtaValue: url hanya https, skema berbahaya ditolak", () => {
  assert.deepEqual(normalizeCtaValue("url", "contoh.com/pesan"), { ok: true, value: "https://contoh.com/pesan" });
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)", "file:///etc/passwd", "http://contoh.com", "ftp://x.test", "mailto:a@b.co", "tel:123456", "https://user:pw@x.test", "https://a b.test", "//evil.test", "blob:https://x.test/1"]) {
    assert.equal(normalizeCtaValue("url", bad).ok, false, bad);
  }
});

test("normalizeCtaValue: email, telepon, kosong", () => {
  assert.equal(normalizeCtaValue("email", "halo@contoh.id").ok, true);
  assert.equal(normalizeCtaValue("email", "halo@contoh").ok, false);
  assert.equal(normalizeCtaValue("email", "a@b.co, c@d.co").ok, false);
  assert.deepEqual(normalizeCtaValue("phone", "+62 21 555-1234"), { ok: true, value: "+6221555-1234" });
  assert.equal(normalizeCtaValue("phone", "javascript:1").ok, false);
  assert.equal(normalizeCtaValue("phone", "12").ok, false);
  for (const t of ["whatsapp", "url", "email", "phone"] as const) {
    assert.equal(normalizeCtaValue(t, "").ok, false);
    assert.equal(normalizeCtaValue(t, "   ").ok, false);
    assert.equal(normalizeCtaValue(t, null).ok, false);
  }
});

test("template pesan: placeholder diisi, bawaan dipakai bila kosong, karakter kontrol dibuang", () => {
  const vars = { judul: "Paket A", username: "rina", nama: "Rina" };
  assert.equal(renderMessageTemplate(null, vars), "Halo, saya tertarik mengenai Paket A di halaman rina. Bisa minta informasi lebih lanjut?");
  assert.equal(renderMessageTemplate("  ", vars), renderMessageTemplate(null, vars));
  assert.equal(renderMessageTemplate("Hai {nama}, {judul}! {tidak_dikenal}", vars), "Hai Rina, Paket A! {tidak_dikenal}");
  assert.equal(renderMessageTemplate("a\u0000b\u0007c", vars), "abc");
  assert.equal(renderMessageTemplate("x$&y {judul}", { ...vars, judul: "$& $1" }), "x$&y $& $1"); // tidak ada interpretasi pola ganti
  assert.ok(Array.from(renderMessageTemplate("x".repeat(5000), vars)).length <= 1000);
  assert.ok(DEFAULT_WA_TEMPLATE.includes("{judul}") && DEFAULT_WA_TEMPLATE.includes("{username}"));
});

test("WhatsApp href: wa.me + teks ter-encode dengan benar (emoji, spasi, &, #, baris baru)", () => {
  const href = buildCtaHref({ type: "whatsapp", value: "6281234567890", message: "Halo & selamat #1\nBaris dua 😀 {judul}" }, ctx) as string;
  assert.ok(href.startsWith("https://wa.me/6281234567890?text="));
  const text = new URL(href).searchParams.get("text");
  assert.equal(text, "Halo & selamat #1\nBaris dua 😀 Paket Foto 📸");
  assert.ok(!/[ \n&#]/.test(href.split("?text=")[1] as string));
});

test("href CTA lain & penolakan nilai berbahaya pada saat render", () => {
  assert.equal(buildCtaHref({ type: "url", value: "https://contoh.com/x?a=1" }, ctx), "https://contoh.com/x?a=1");
  assert.equal(buildCtaHref({ type: "phone", value: "+6221555" }, ctx), "tel:+6221555");
  assert.equal(buildCtaHref({ type: "email", value: "a@b.co" }, ctx), `mailto:a@b.co?subject=${encodeURIComponent("Paket Foto 📸")}`);
  // data dari snapshot yang dimanipulasi tidak pernah menjadi href
  for (const evil of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "http://x.test"]) {
    assert.equal(buildCtaHref({ type: "url", value: evil }, ctx), null, evil);
  }
  assert.equal(buildCtaHref({ type: "whatsapp", value: "javascript:1" }, ctx), null);
  assert.equal(buildCtaHref({ type: "bukan-jenis", value: "x" }, ctx), null);
});

test("tujuan kosong => tidak ada CTA (tidak ada tujuan fiktif)", () => {
  assert.equal(resolveCta({ type: null, value: null }, ctx), null);
  assert.equal(resolveCta({ type: "whatsapp", value: "" }, ctx), null);
  assert.equal(resolveCta({ type: "whatsapp", value: null, label: "Pesan" }, ctx), null);
  assert.equal(resolveCta({ type: undefined, value: "https://x.test" }, ctx), null);
});

test("label: kustom dipertahankan, bawaan hanya saat kosong", () => {
  assert.equal(resolveCta({ type: "whatsapp", value: "6281234567890", label: "Pesan sekarang" }, ctx)?.label, "Pesan sekarang");
  assert.equal(resolveCta({ type: "whatsapp", value: "6281234567890", label: "" }, ctx)?.label, DEFAULT_CTA_LABEL.whatsapp);
  assert.equal(resolveCta({ type: "url", value: "https://x.test" }, ctx)?.label, "Lihat detail");
  const wa = resolveCta({ type: "whatsapp", value: "6281234567890" }, ctx);
  assert.equal(wa?.external, true);
  assert.equal(resolveCta({ type: "phone", value: "+6221555" }, ctx)?.external, false);
});
