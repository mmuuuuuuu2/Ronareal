// Navigasi keyboard untuk tablist (pola WAI-ARIA "tabs", aktivasi otomatis). Modul murni agar mudah diuji.
export type TabKey = "ArrowRight" | "ArrowLeft" | "ArrowDown" | "ArrowUp" | "Home" | "End";

/** Indeks tab berikutnya untuk sebuah tombol; null bila tombol bukan navigasi tab. Melingkar di kedua ujung. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0 || current < 0 || current >= count) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
