import assert from "node:assert/strict";
import { test } from "node:test";
import { SLIDE_INTERVAL_MS, createSlideshow, galleryReducer, initGallery, type Timers } from "../src/lib/catalog/gallery.ts";

function fakeTimers() {
  let nextId = 1;
  const active = new Map<number, { fn: () => void; ms: number }>();
  const timers: Timers<number> = {
    set: (fn, ms) => { const id = nextId++; active.set(id, { fn, ms }); return id; },
    clear: (id) => { active.delete(id); },
  };
  return { timers, active, fire: () => active.forEach((t) => t.fn()) };
}

test("slideshow otomatis ~2 detik, mulai bila foto > 1", () => {
  assert.equal(SLIDE_INTERVAL_MS, 2000);
  assert.equal(initGallery(3).playing, true);
  assert.equal(initGallery(1).playing, false);
  assert.equal(initGallery(0).playing, false);
});

test("prefers-reduced-motion: slideshow tidak berjalan otomatis", () => {
  const s = initGallery(5, 0, true);
  assert.equal(s.playing, false);
  assert.equal(galleryReducer(s, { type: "tick" }).index, 0);
});

test("tick maju & berputar; navigasi manual menjeda; toggle melanjutkan", () => {
  let s = initGallery(3);
  s = galleryReducer(s, { type: "tick" }); assert.equal(s.index, 1);
  s = galleryReducer(s, { type: "tick" }); s = galleryReducer(s, { type: "tick" }); assert.equal(s.index, 0, "berputar ke awal");
  s = galleryReducer(s, { type: "next" }); assert.deepEqual([s.index, s.playing], [1, false]);
  s = galleryReducer(s, { type: "tick" }); assert.equal(s.index, 1, "tick diabaikan saat dijeda");
  s = galleryReducer(s, { type: "prev" }); s = galleryReducer(s, { type: "prev" }); assert.equal(s.index, 2, "prev berputar ke akhir");
  s = galleryReducer(s, { type: "goto", index: 1 }); assert.equal(s.index, 1);
  s = galleryReducer(s, { type: "toggle" }); assert.equal(s.playing, true);
  s = galleryReducer(s, { type: "pause" }); assert.equal(s.playing, false);
});

test("satu foto: tidak ada navigasi/slideshow", () => {
  const s = initGallery(1);
  for (const a of [{ type: "next" }, { type: "prev" }, { type: "tick" }, { type: "toggle" }] as const) {
    const n = galleryReducer(s, a);
    assert.deepEqual([n.index, n.playing], [0, false]);
  }
});

test("indeks awal dibulatkan ke rentang valid", () => {
  assert.equal(initGallery(3, 7).index, 1);
  assert.equal(initGallery(3, -1).index, 2);
});

test("slideshow berhenti ketika dihentikan (modal ditutup / komponen dilepas): timer dibersihkan", () => {
  const { timers, active, fire } = fakeTimers();
  let ticks = 0;
  const show = createSlideshow({ onTick: () => ticks++, timers });
  show.start(); show.start(); // idempoten: tetap satu timer
  assert.equal(active.size, 1);
  assert.equal([...active.values()][0]!.ms, 2000);
  fire(); fire();
  assert.equal(ticks, 2);
  show.stop(); // = cleanup efek saat modal ditutup
  assert.equal(active.size, 0, "tidak ada timer tersisa");
  assert.equal(show.running(), false);
  fire();
  assert.equal(ticks, 2, "tidak ada tick setelah berhenti");
  show.stop(); // aman dipanggil ulang
  show.start();
  assert.equal(active.size, 1);
  show.stop();
  assert.equal(active.size, 0);
});
