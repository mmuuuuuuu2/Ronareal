export default function SettingsLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="skeleton h-10 w-48" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton mx-auto h-96 w-full max-w-2xl" />
      <span className="sr-only">Memuat pengaturan…</span>
    </div>
  );
}
