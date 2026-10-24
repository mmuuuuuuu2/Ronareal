import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS, buildDraftConfig, contrastRatio, contrastWarning, parseDraftConfig, sanitizeSettings,
} from "../src/lib/editor/settings.ts";

test("config kosong/rusak -> default, tidak pernah melempar", () => {
  for (const raw of [{}, null, undefined, [], "x", 5, { settings: "x" }, { settings: [] }]) {
    assert.deepEqual(parseDraftConfig(raw), DEFAULT_SETTINGS);
  }
});

test("nilai tidak valid diganti default per kolom, nilai valid dipertahankan", () => {
  const s = sanitizeSettings({
    backgroundColor: "#abc", textColor: "#ffffff", radius: "huge", alignment: "left", backgroundOverlay: 999,
    showDescriptions: "ya", componentStyle: "solid", spacing: null,
  });
  assert.equal(s.backgroundColor, DEFAULT_SETTINGS.backgroundColor);
  assert.equal(s.textColor, "#FFFFFF");
  assert.equal(s.radius, DEFAULT_SETTINGS.radius);
  assert.equal(s.alignment, "left");
  assert.equal(s.backgroundOverlay, 60);
  assert.equal(s.showDescriptions, true);
  assert.equal(s.componentStyle, "solid");
  assert.equal(s.spacing, DEFAULT_SETTINGS.spacing);
});

test("injeksi lewat warna/enum ditolak", () => {
  const s = sanitizeSettings({ backgroundColor: "red; background:url(javascript:1)", textColor: "#222222\"><script>" });
  assert.equal(s.backgroundColor, DEFAULT_SETTINGS.backgroundColor);
  assert.equal(s.textColor, DEFAULT_SETTINGS.textColor);
});

test("buildDraftConfig mempertahankan kunci lain dan tidak mengubah input", () => {
  const existing = { catalog: { items: [1, 2] }, version: 0 };
  const out = buildDraftConfig(existing, { ...DEFAULT_SETTINGS, radius: "sm" });
  assert.deepEqual(out.catalog, { items: [1, 2] });
  assert.equal(out.version, 1);
  assert.equal((out.settings as { radius: string }).radius, "sm");
  assert.equal(existing.version, 0);
  assert.deepEqual(buildDraftConfig("rusak", DEFAULT_SETTINGS).settings, DEFAULT_SETTINGS);
});

test("round trip simpan -> baca", () => {
  const custom = { ...DEFAULT_SETTINGS, alignment: "left" as const, componentStyle: "outline" as const };
  assert.deepEqual(parseDraftConfig(buildDraftConfig({}, custom)), custom);
});

test("kontras WCAG", () => {
  assert.ok(Math.abs(contrastRatio("#000000", "#FFFFFF") - 21) < 0.01);
  assert.ok(contrastRatio("#222222", "#F7F6F2") > 12);
  assert.equal(contrastWarning(DEFAULT_SETTINGS), null);
  assert.ok(contrastWarning({ ...DEFAULT_SETTINGS, textColor: "#CCCCCC" }));
  assert.equal(contrastWarning({ ...DEFAULT_SETTINGS, textColor: "#CCCCCC", backgroundMode: "image" }), null);
});
