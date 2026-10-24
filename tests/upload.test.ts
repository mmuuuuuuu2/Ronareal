import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_UPLOAD_BYTES, OUTPUT_SPEC, buildAssetPath, checkImageMeta, computeCrop, isOwnedAssetPath, sniffImageType, validateImageBytes,
} from "../src/lib/editor/upload.ts";

const UID = "11111111-2222-3333-4444-555555555555";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test("metadata: MIME dan ukuran", () => {
  assert.equal(checkImageMeta({ type: "image/png", size: 1000 }).ok, true);
  assert.equal(checkImageMeta({ type: "image/webp", size: MAX_UPLOAD_BYTES }).ok, true);
  assert.equal(checkImageMeta({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }).ok, false);
  assert.equal(checkImageMeta({ type: "image/svg+xml", size: 10 }).ok, false);
  assert.equal(checkImageMeta({ type: "image/gif", size: 10 }).ok, false);
  assert.equal(checkImageMeta({ type: "text/html", size: 10 }).ok, false);
  assert.equal(checkImageMeta({ type: "image/png", size: 0 }).ok, false);
  assert.equal(checkImageMeta({ type: undefined, size: 10 }).ok, false);
  assert.equal(checkImageMeta({ type: "image/png", size: NaN }).ok, false);
});

test("sniff: mengenali JPEG/PNG/WebP dari byte, menolak lainnya", () => {
  assert.equal(sniffImageType(PNG), "image/png");
  assert.equal(sniffImageType(JPG), "image/jpeg");
  assert.equal(sniffImageType(WEBP), "image/webp");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffImageType(new TextEncoder().encode("GIF89a....")), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});

test("server: MIME yang diklaim harus cocok dengan isi (anti file palsu)", () => {
  assert.equal(validateImageBytes(PNG, "image/png").ok, true);
  assert.equal(validateImageBytes(PNG, "image/jpeg").ok, false); // PNG berpura-pura JPEG
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.equal(validateImageBytes(html, "image/png").ok, false); // HTML berpura-pura PNG
  assert.equal(validateImageBytes(new Uint8Array(0), "image/png").ok, false);
  const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  big.set(PNG);
  assert.equal(validateImageBytes(big, "image/png").ok, false);
});

test("path aset cocok dengan pola policy storage/trigger database", () => {
  const p = buildAssetPath(UID, "avatar", "image/webp", "abcd1234-ef56");
  assert.equal(p, `${UID}/avatar/abcd1234-ef56.webp`);
  const db = new RegExp(`^${UID}/avatar/[A-Za-z0-9._-]{1,80}\\.(jpg|jpeg|png|webp)$`);
  assert.ok(db.test(p));
  assert.throws(() => buildAssetPath("../x", "avatar", "image/png", "abcd1234"));
  assert.throws(() => buildAssetPath(UID, "catalog" as never, "image/png", "abcd1234"));
  assert.throws(() => buildAssetPath(UID, "link", "image/png", "../../etc"));
});

test("isOwnedAssetPath menolak milik orang lain / jenis lain / traversal", () => {
  const other = "99999999-2222-3333-4444-555555555555";
  assert.ok(isOwnedAssetPath(`${UID}/link/a.png`, UID, "link"));
  assert.ok(!isOwnedAssetPath(`${other}/link/a.png`, UID, "link"));
  assert.ok(!isOwnedAssetPath(`${UID}/avatar/a.png`, UID, "link"));
  assert.ok(!isOwnedAssetPath(`${UID}/link/../a.png`, UID, "link"));
  assert.ok(!isOwnedAssetPath(`${UID}/link/a.svg`, UID, "link"));
  assert.ok(!isOwnedAssetPath(null, UID, "link"));
});

test("computeCrop: selalu di dalam gambar dan berasio target", () => {
  for (const [w, h] of [[4000, 3000], [1000, 2000], [500, 500], [64, 4000]] as const) {
    for (const kind of ["avatar", "background", "link"] as const) {
      const a = OUTPUT_SPEC[kind].aspect;
      for (const [z, fx, fy] of [[1, 0.5, 0.5], [2, 0, 0], [3, 1, 1], [9, -5, 7], [NaN, NaN, NaN]] as const) {
        const r = computeCrop(w, h, a, z, fx, fy);
        assert.ok(r.sx >= -1e-9 && r.sy >= -1e-9, "origin >= 0");
        assert.ok(r.sx + r.sw <= w + 1e-6 && r.sy + r.sh <= h + 1e-6, "dalam batas");
        assert.ok(Math.abs(r.sw / r.sh - a) < 1e-6, "rasio sesuai");
      }
    }
  }
  assert.throws(() => computeCrop(0, 10, 1));
});

test("spesifikasi keluaran: avatar 1:1, latar potret ponsel", () => {
  assert.equal(OUTPUT_SPEC.avatar.width, OUTPUT_SPEC.avatar.height);
  assert.ok(OUTPUT_SPEC.background.height > OUTPUT_SPEC.background.width);
});
