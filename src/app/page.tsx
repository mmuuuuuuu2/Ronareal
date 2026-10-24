import Link from "next/link";
import { HeroReveal } from "@/components/ui/hero-reveal";
import { RonaMark } from "@/components/rona-mark";

// Halaman publik statis: tidak memanggil Supabase sehingga ringan dan dapat di-cache.
export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-3 font-semibold" aria-label="RONA, halaman utama">
          <RonaMark size={36} priority />
          <span className="text-lg tracking-tight">RONA</span>
        </Link>
        <nav aria-label="Akun" className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">
            Masuk
          </Link>
          <Link href="/register" className="btn btn-primary hidden sm:inline-flex">
            Buat akun
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-14 py-10 md:py-16">
        <HeroReveal className="grid items-center gap-10 md:grid-cols-[1.25fr_0.75fr] md:gap-12">
          <div>
            <h1 className="text-4xl font-semibold sm:text-5xl lg:text-6xl">
              Satu alamat untuk semua tautan dan layananmu.
            </h1>
            <p className="mt-5 max-w-xl text-lg" style={{ color: "var(--rona-fg-muted)" }}>
              RONA membantumu menyusun profil, tautan, dan katalog di halaman pribadi yang rapi. Kamu sudah bisa
              membuat akun dan memilih username. Editor halaman dan katalog masih dalam pengerjaan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn btn-primary">
                Buat akun
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Masuk
              </Link>
            </div>
          </div>

          <div
            className="glass mx-auto grid aspect-square w-full max-w-xs place-items-center p-8"
            style={{
              background:
                "linear-gradient(145deg, color-mix(in srgb, var(--rona-mist) 70%, #fff), color-mix(in srgb, var(--rona-sand) 70%, #fff))",
            }}
          >
            <RonaMark size={160} priority />
          </div>
        </HeroReveal>

        <section aria-labelledby="status-heading" className="grid gap-6 sm:grid-cols-2">
          <h2 id="status-heading" className="sr-only">
            Status pengembangan
          </h2>
          <div className="surface p-5">
            <h3 className="text-lg font-semibold">Sudah tersedia</h3>
            <ul className="mt-3 space-y-1.5 text-base">
              <li>Daftar dan masuk dengan email</li>
              <li>Memilih username untuk alamat halamanmu</li>
              <li>Dashboard pribadi</li>
            </ul>
          </div>
          <div className="surface p-5">
            <h3 className="text-lg font-semibold">Sedang dikerjakan</h3>
            <ul className="mt-3 space-y-1.5 text-base">
              <li>Editor halaman tautan</li>
              <li>Pratinjau dan publikasi</li>
              <li>Katalog layanan dan produk</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="py-6 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
        RONA
      </footer>
    </div>
  );
}
