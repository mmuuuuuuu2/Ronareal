import Image from "next/image";

// Satu-satunya tempat yang merujuk berkas ikon turunan. Sumber asli: brand/rona-icon-source.png.
// 192px cukup tajam sampai ~96px tampil di layar 2x; gunakan ukuran lebih besar hanya bila perlu.
export function RonaMark({ size = 40, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <Image
      src="/icons/rona-192.png"
      alt="RONA"
      width={size}
      height={size}
      priority={priority}
      className="rona-mark"
    />
  );
}
