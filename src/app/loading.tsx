import { RonaMark } from "@/components/rona-mark";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="skeleton p-3">
        <RonaMark size={48} />
      </div>
      <span className="sr-only">Memuat…</span>
    </div>
  );
}
