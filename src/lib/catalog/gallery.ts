// Logika galeri modal — modul murni agar bisa diuji tanpa DOM. Komponen hanya memetakan state ini ke tampilan.
// Aturan: slideshow otomatis ~2 detik bila foto > 1; berhenti saat pengguna memakai kontrol manual; tidak berjalan
// bila prefers-reduced-motion; timer SELALU dibersihkan saat modal ditutup / komponen dilepas.

export const SLIDE_INTERVAL_MS = 2000;

export type GalleryState = { index: number; count: number; playing: boolean };

export type GalleryAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "tick" } // dari timer otomatis
  | { type: "toggle" }
  | { type: "pause" };

const wrap = (i: number, n: number) => (n <= 0 ? 0 : ((i % n) + n) % n);

export function initGallery(count: number, startIndex = 0, reducedMotion = false): GalleryState {
  const n = Math.max(0, Math.floor(count));
  return { index: wrap(startIndex, n), count: n, playing: n > 1 && !reducedMotion };
}

export function galleryReducer(s: GalleryState, a: GalleryAction): GalleryState {
  if (s.count <= 1) return s.playing ? { ...s, playing: false } : s;
  switch (a.type) {
    case "tick":
      return s.playing ? { ...s, index: wrap(s.index + 1, s.count) } : s;
    case "next": // interaksi manual menjeda slideshow
      return { ...s, index: wrap(s.index + 1, s.count), playing: false };
    case "prev":
      return { ...s, index: wrap(s.index - 1, s.count), playing: false };
    case "goto":
      return { ...s, index: wrap(a.index, s.count), playing: false };
    case "toggle":
      return { ...s, playing: !s.playing };
    case "pause":
      return s.playing ? { ...s, playing: false } : s;
  }
}

export type Timers<H = unknown> = {
  set: (fn: () => void, ms: number) => H;
  clear: (handle: H) => void;
};

/** Pengendali slideshow dengan timer yang dapat disuntikkan (diuji dengan timer palsu). start() idempoten. */
export function createSlideshow<H>(opts: { intervalMs?: number; onTick: () => void; timers: Timers<H> }) {
  let handle: H | null = null;
  const interval = opts.intervalMs ?? SLIDE_INTERVAL_MS;
  return {
    start() {
      if (handle !== null) return;
      handle = opts.timers.set(() => opts.onTick(), interval);
    },
    stop() {
      if (handle === null) return;
      opts.timers.clear(handle);
      handle = null;
    },
    running: () => handle !== null,
  };
}
