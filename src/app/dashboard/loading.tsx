export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-3">
        <div className="skeleton h-10 w-2/3 max-w-md" />
        <div className="skeleton h-5 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-56" />
        <div className="skeleton h-56" />
      </div>
      <span className="sr-only">Memuat dashboard…</span>
    </div>
  );
}
