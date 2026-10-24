// Stub "motion/react" UNTUK HARNESS (paket asli tidak terpasang karena npm tidak terjangkau). Animasi Motion TIDAK diuji di sini.
import { createElement, type ReactNode } from "react";
const strip = ({ initial, animate, transition, exit, whileHover, whileTap, layout, ...rest }: Record<string, unknown>) => rest;
export const motion: any = new Proxy({}, { get: (_t, tag: string) => (props: Record<string, unknown>) => createElement(tag, strip(props)) });
export function MotionConfig({ children }: { reducedMotion?: string; children?: ReactNode }) { return <>{children}</>; }
export const useReducedMotion = () => false;
