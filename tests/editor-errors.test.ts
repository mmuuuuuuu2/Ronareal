import assert from "node:assert/strict";
import { test } from "node:test";
import { mapEditorError, mapUploadError } from "../src/lib/editor/errors.ts";

test("galat database -> pesan Indonesia tanpa membocorkan pesan mentah", () => {
  assert.equal(mapEditorError({ message: "username_taken" }).field, "username");
  assert.equal(mapEditorError({ message: "username_locked_published" }).field, "username");
  assert.equal(mapEditorError({ message: "link_limit_reached" }).retryable, false);
  assert.equal(mapEditorError({ message: "reorder_mismatch" }).retryable, false);
  assert.equal(mapEditorError({ message: 'violates check constraint "page_links_url_scheme"' }).field, "url");
  assert.match(mapEditorError({ message: "new row violates row-level security policy" }).message, /akses/);
  const raw = mapEditorError({ message: "SELECT * FROM secret_table failed at host db.internal" });
  assert.ok(!raw.message.includes("secret_table"));
  assert.equal(raw.retryable, true);
});

test("galat jaringan dan sesi", () => {
  assert.equal(mapEditorError({ message: "fetch failed" }).retryable, true);
  assert.match(mapEditorError({ message: "not_authenticated" }).message, /Sesi/);
  assert.equal(mapEditorError(null).retryable, true);
});

test("galat unggah", () => {
  assert.match(mapUploadError({ message: "The object exceeded the maximum allowed size" }).message, /5 MB/);
  assert.match(mapUploadError({ message: "mime type image/svg+xml is not supported" }).message, /Format/);
  assert.match(mapUploadError({ message: "new row violates row-level security policy" }).message, /izin/);
  assert.equal(mapUploadError({ message: "fetch failed" }).retryable, true);
});

test("pesan galat katalog (Phase 5) dipetakan ke Bahasa Indonesia tanpa membocorkan pesan mentah", async () => {
  const { mapEditorError } = await import("../src/lib/editor/errors.ts");
  for (const [raw, expected] of [
    ["catalog_image_limit_reached", /maksimal 7 foto/],
    ["catalog_item_limit_reached", /batas \(30\)/],
    ["catalog_item_not_found", /bukan milik Anda/],
    ["image_object_missing", /Unggah ulang/],
    ["catalog_title_invalid", /Judul section/],
    ["violates check constraint \"catalog_items_cta_format\"", /Tujuan tombol/],
  ] as const) {
    const m = mapEditorError({ message: raw });
    assert.match(m.message, expected, raw);
    assert.ok(!m.message.includes("catalog_"), "tidak membocorkan nama internal");
  }
});
