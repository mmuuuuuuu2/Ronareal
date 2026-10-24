import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { contrastRatio } from "../src/lib/editor/settings.ts";

const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const hex = (name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens);
  assert.ok(m, `${name} harus berupa warna hex di tokens.css`);
  return (m[1] as string).toUpperCase();
};

// Kontras WCAG AA (teks biasa >= 4,5:1) untuk pasangan warna yang dipakai komponen UI (status, toast, tombol bahaya).
test("kontras token status memenuhi 4,5:1 di atas permukaan terang", () => {
  const white = "#FFFFFF";
  const porcelain = hex("--rona-porcelain");
  assert.ok(contrastRatio(hex("--rona-ink"), porcelain) >= 4.5, "teks utama / porcelain");
  assert.ok(contrastRatio(hex("--rona-danger"), white) >= 4.5, "danger / putih");
  assert.ok(contrastRatio(hex("--rona-success"), white) >= 4.5, "success / putih");
  assert.ok(contrastRatio(hex("--rona-danger-fg"), "#F9EEEE") >= 4.5, "teks galat / latar notice galat");
  assert.ok(contrastRatio(hex("--rona-success-fg"), "#EDF4F0") >= 4.5, "teks sukses / latar notice sukses");
  assert.ok(contrastRatio("#FFFFFF", hex("--rona-danger")) >= 4.5, "tombol bahaya: putih / danger");
  assert.ok(contrastRatio(porcelain, hex("--rona-danger-fg")) >= 4.5, "toast galat");
  assert.ok(contrastRatio(porcelain, hex("--rona-ink")) >= 4.5, "toast sukses");
});

test("token wajib ada dan target sentuh minimal 44px", () => {
  assert.match(tokens, /--rona-tap:\s*2\.75rem/);
  for (const t of ["--rona-safe-top", "--rona-safe-bottom", "--rona-focus", "--rona-focus-halo", "--rona-z-toast"]) assert.match(tokens, new RegExp(`${t}:`));
});
