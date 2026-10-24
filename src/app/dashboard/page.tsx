import { getTrustedSiteUrl } from "@/lib/site";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyUrl } from "@/components/publish/copy-url";
import { getCurrentUser, getOwnPage, getProfile } from "@/lib/auth/session";
import { loadPublishState } from "@/lib/publish/load";
import { describePublish } from "@/lib/publish/state";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(date);
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  // Dua query kecil dan paralel, hanya kolom yang dipakai. Profil sudah di-cache dari layout (tanpa query ulang).
  const [profile, page, publish] = await Promise.all([getProfile(user.id), getOwnPage(user.id), loadPublishState()]);
  const view = describePublish(publish, "idle", false);
  if (!profile) redirect("/onboarding");

  const name = profile.display_name?.trim() || profile.username;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold sm:text-4xl">Halo, {name}.</h1>
        <p className="mt-2" style={{ color: "var(--rona-fg-muted)" }}>
          Akunmu sudah aktif. Atur profil, tampilan, dan tautan di editor halaman, lalu terbitkan agar bisa dilihat siapa pun. Katalog belum tersedia.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="profil-heading" className="surface p-5">
          <h2 id="profil-heading" className="text-lg font-semibold">
            Profil
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt style={{ color: "var(--rona-fg-muted)" }}>Nama tampilan</dt>
              <dd className="font-medium">{name}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--rona-fg-muted)" }}>Username</dt>
              <dd className="font-medium">@{profile.username}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--rona-fg-muted)" }}>Email</dt>
              <dd className="font-medium break-all">{user.email ?? "-"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--rona-fg-muted)" }}>Status onboarding</dt>
              <dd>
                <span className="badge">Selesai</span>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="halaman-heading" className="surface p-5">
          <h2 id="halaman-heading" className="text-lg font-semibold">
            Halaman personal
          </h2>
          {page ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                {publish.isPublished
                  ? "Halamanmu aktif dan bisa dibuka siapa pun."
                  : "Halamanmu masih draft pribadi dan belum bisa dibuka pengunjung."}
              </p>
              <dl className="space-y-2">
                <div>
                  <dt style={{ color: "var(--rona-fg-muted)" }}>Status</dt>
                  <dd className="font-medium" data-publish-status={view.key}>{view.label}</dd>
                </div>
                <div>
                  <dt style={{ color: "var(--rona-fg-muted)" }}>Terakhir diperbarui</dt>
                  <dd className="font-medium">{formatDate(page.updated_at)}</dd>
                </div>
              </dl>
              {view.showLiveUrl ? <CopyUrl username={profile.username} baseUrl={getTrustedSiteUrl()} /> : null}
            </div>
          ) : (
            <p className="mt-4 text-sm">
              Halaman personalmu belum tersedia. Coba muat ulang halaman ini; jika tetap sama, keluar lalu masuk lagi.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/dashboard/editor" className="btn btn-primary">
              Buka editor & terbitkan
            </Link>
            <Link href="/dashboard/settings" className="btn btn-ghost">
              Pengaturan akun & halaman
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
