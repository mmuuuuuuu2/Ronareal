"use client";

import { useRef, type KeyboardEvent } from "react";
import { nextTabIndex } from "@/lib/ui/tabs";

// Tablist yang dapat dipakai penuh dengan keyboard: panah/Home/End berpindah dan memberi fokus (roving tabindex).
// Panel dihubungkan lewat id konvensi: `${idPrefix}-tab-${id}` dan `${idPrefix}-panel-${id}` (lihat tabIds()).
export const tabIds = (idPrefix: string, id: string) => ({ tab: `${idPrefix}-tab-${id}`, panel: `${idPrefix}-panel-${id}` });

export function Tabs<T extends string>({
  tabs, value, onChange, label, idPrefix,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((t) => t.id === value);
    const next = nextTabIndex(e.key, current, tabs.length);
    if (next === null) return;
    e.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    refs.current[next]?.focus();
  };
  return (
    <div className="seg" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t, i) => {
        const ids = tabIds(idPrefix, t.id);
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-controls={ids.panel}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="seg-btn"
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
