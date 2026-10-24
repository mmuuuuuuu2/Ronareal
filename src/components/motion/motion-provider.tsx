"use client";

import { MotionConfig } from "motion/react";

// Semua animasi Motion di dashboard mengikuti preferensi sistem: dengan reduced-motion, transform/layout dimatikan (opacity tetap).
// Hanya dipasang di dashboard; halaman publik tidak memuat Motion (tetap ringan).
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
