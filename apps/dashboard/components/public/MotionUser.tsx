"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Honour prefers-reduced-motion for every motion component inside: transforms off, fades kept. */
export function MotionUser({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
