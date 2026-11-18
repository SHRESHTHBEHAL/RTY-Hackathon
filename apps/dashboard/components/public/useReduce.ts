"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * prefers-reduced-motion, read after hydration so the server render and the
 * first client render agree. Pair with <MotionConfig reducedMotion="user">,
 * which drops transform animations for those users from the very first frame.
 */
export function useReduce(): boolean {
  const pref = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && pref;
}
