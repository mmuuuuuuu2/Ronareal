import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { nextTabIndex } from "../src/lib/ui/tabs.ts";

test("nextTabIndex: panah, melingkar, Home/End", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 4), 1);
  assert.equal(nextTabIndex("ArrowRight", 3, 4), 0);
  assert.equal(nextTabIndex("ArrowDown", 1, 4), 2);
  assert.equal(nextTabIndex("ArrowLeft", 0, 4), 3);
  assert.equal(nextTabIndex("ArrowUp", 2, 4), 1);
  assert.equal(nextTabIndex("Home", 2, 4), 0);
  assert.equal(nextTabIndex("End", 0, 4), 3);
});

test("nextTabIndex: tombol lain dan indeks tak valid diabaikan", () => {
  assert.equal(nextTabIndex("Enter", 0, 4), null);
  assert.equal(nextTabIndex("a", 0, 4), null);
  assert.equal(nextTabIndex("ArrowRight", -1, 4), null);
  assert.equal(nextTabIndex("ArrowRight", 4, 4), null);
  assert.equal(nextTabIndex("ArrowRight", 0, 0), null);
});

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

test("design tokens: nilai status/fokus/elevasi/safe-area didefinisikan sekali di tokens.css", () => {
  for (const t of ["--rona-danger", "--rona-success", "--rona-focus", "--rona-elev-1", "--rona-elev-2", "--rona-elev-3", "--rona-tap", "--rona-safe-bottom", "--rona-scrim", "--rona-text-base"]) {
    assert.match(tokens, new RegExp(`${t}\\s*:`), `${t} harus ada`);
  }
  // globals.css tidak lagi menyimpan warna status literal (satu sumber)
  assert.doesNotMatch(css, /#a4262c|#1e6b45|#7a1c21|#174f34|#8c1f26/i);
});

test("motion: semua animasi CSS baru dijaga prefers-reduced-motion dan hover hanya di perangkat hover", () => {
  assert.match(tokens, /prefers-reduced-motion: reduce/);
  const phase6 = css.slice(css.indexOf("Phase 6: komponen bersama"));
  assert.match(phase6, /prefers-reduced-motion: no-preference[\s\S]*\.rona-rise/);
  assert.match(phase6, /@media \(hover: hover\)[\s\S]*a\.rona-link:hover/);
  // hanya opacity/transform yang dianimasikan (bukan width/height/top/left)
  // isi @keyframes dibaca dengan pencocokan kurung (keyframes satu baris tidak boleh "menelan" aturan lain)
  const keyframes: string[] = [];
  for (const m of css.matchAll(/@keyframes rona-[\w-]+ \{/g)) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    keyframes.push(css.slice(start, i - 1));
  }
  assert.ok(keyframes.length >= 4, "keyframes terbaca");
  for (const k of keyframes) assert.doesNotMatch(k, /\b(width|height|top|left|margin|padding)\s*:/, "keyframes tidak boleh menganimasikan layout");
});

test("a11y: dialog konfirmasi memakai <dialog> native, alertdialog, fokus awal pada Batal", () => {
  const src = readFileSync(new URL("../src/components/ui/confirm-dialog.tsx", import.meta.url), "utf8");
  assert.match(src, /showModal\(\)/);
  assert.match(src, /role="alertdialog"/);
  assert.match(src, /autoFocus/);
  assert.match(src, /aria-labelledby/);
});

test("a11y: Tabs memakai roving tabindex + aria-controls; toast galat tidak hilang otomatis", () => {
  const tabs = readFileSync(new URL("../src/components/ui/tabs.tsx", import.meta.url), "utf8");
  assert.match(tabs, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(tabs, /aria-controls/);
  const toast = readFileSync(new URL("../src/components/ui/toast.tsx", import.meta.url), "utf8");
  assert.match(toast, /kind !== "success"\) return/);
  assert.match(toast, /clearTimeout/);
});
