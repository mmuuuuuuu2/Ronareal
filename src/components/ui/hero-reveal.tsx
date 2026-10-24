"use client";

import { motion, useReducedMotion } from "motion/react";

// Satu-satunya gerak otomatis di aplikasi: pembukaan hero saat halaman pertama dimuat.
// Dengan reduced-motion aktif, konten langsung tampil tanpa transisi.
export function HeroReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
