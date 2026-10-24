export default function EditorLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="skeleton h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
      <span className="sr-only">Memuat editor…</span>
    </div>
  );
}
