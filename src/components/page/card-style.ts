import type { CSSProperties } from "react";
import type { PageSettings } from "@/lib/editor/settings";

// Gaya kartu bersama: tautan (PageView) dan kartu katalog memakai pengaturan tampilan yang sama (radius, gaya komponen).
export const RADIUS: Record<PageSettings["radius"], string> = { sm: "10px", md: "16px", lg: "22px", pill: "999px" };

export function cardStyle(s: PageSettings): CSSProperties {
  const base: CSSProperties = {
    borderRadius: RADIUS[s.radius],
    color: s.textColor,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    textDecoration: "none",
    minHeight: "56px",
    textAlign: "left",
  };
  if (s.componentStyle === "solid") {
    return { ...base, background: s.textColor, color: s.backgroundColor, border: "1px solid transparent" };
  }
  if (s.componentStyle === "outline") {
    return { ...base, background: "transparent", border: `1.5px solid ${s.textColor}` };
  }
  return {
    ...base,
    background: `color-mix(in srgb, ${s.textColor} 9%, transparent)`,
    border: `1px solid color-mix(in srgb, ${s.textColor} 16%, transparent)`,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };
}
