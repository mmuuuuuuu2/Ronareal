import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="glass w-full max-w-md p-6 text-center sm:p-8">
        <h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--rona-fg-muted)" }}>
          Alamat yang kamu buka tidak ada, atau halamannya belum diterbitkan.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Ke beranda
        </Link>
      </div>
    </div>
  );
}
