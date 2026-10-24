import assert from "node:assert/strict";
import { test } from "node:test";
import { safeHref, validateLinkUrl } from "../src/lib/validation/url.ts";

const ok = (input: string, expected?: string) => {
  const r = validateLinkUrl(input);
  assert.equal(r.ok, true, `harus valid: ${input}`);
  if (r.ok && expected) assert.equal(r.value, expected);
};
const bad = (input: unknown) => assert.equal(validateLinkUrl(input).ok, false, `harus ditolak: ${String(input)}`);

test("menerima http, https, mailto, tel", () => {
  ok("https://contoh.com", "https://contoh.com");
  ok("http://contoh.com/a?b=1#c");
  ok("HTTPS://Contoh.com/Path");
  ok("mailto:halo@contoh.com");
  ok("mailto:halo@contoh.com?subject=Hai");
  ok("tel:+628123456789");
  ok("tel:(021) 555-1234".replace(" ", "")); // tanpa spasi
});

test("melengkapi https:// untuk input tanpa skema", () => {
  ok("contoh.com/halaman", "https://contoh.com/halaman");
  ok("  www.contoh.com  ", "https://www.contoh.com");
  ok("localhost:3000/x", "https://localhost:3000/x");
});

test("menolak skema berbahaya (termasuk variasi huruf besar)", () => {
  for (const u of [
    "javascript:alert(1)", "JavaScript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=", "DATA:text/html,x", "vbscript:msgbox(1)", "file:///etc/passwd",
    "blob:https://x.com/uuid", "ftp://contoh.com", "ws://contoh.com", "about:blank", "intent://x#Intent;end",
  ]) bad(u);
});

test("menolak trik penyamaran skema", () => {
  bad("java\tscript:alert(1)");
  bad("java\nscript:alert(1)");
  bad("jav&#x61;script:alert(1)");
  bad("\u0000javascript:alert(1)");
  bad("https://contoh.com/a b");
  bad("https://contoh.com/\nb");
  bad("//contoh.com");
  bad("/relatif");
});

test("menolak input kosong, bukan string, terlalu panjang, tanpa host, dan kredensial", () => {
  bad(""); bad("   "); bad(undefined); bad(null); bad(42); bad({});
  bad("https://" + "a".repeat(2050) + ".com");
  bad("https://");
  bad("https://user:pass@contoh.com");
  bad("hanya teks biasa");
  bad("mailto:bukan-email");
  bad("tel:abc");
  bad("tel:12");
});

test("safeHref hanya mengembalikan URL aman", () => {
  assert.equal(safeHref("https://contoh.com"), "https://contoh.com");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref(undefined), null);
});
