"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { SPRING_LANDING } from "./motion-tokens";

export type PunchesProps = {
  /** Holes in the row. */
  total: number;
  /** How many are punched. Each new punch pops in with the landing spring. */
  used: number;
  /** ink when on a dark ticket. */
  tone?: "card" | "ink" | "pass";
  className?: string;
  /** Screen-reader summary, e.g. "3 of 10 charges used". */
  label?: string;
};

/** A credential's row of holes; each charge punches one. */
export function Punches({ total, used, tone = "card", className, label }: PunchesProps) {
  const reduce = useReducedMotion();
  // Holes already punched at first render appear still; only new punches animate.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const holes = Math.max(0, Math.min(total, 40));
  return (
    <div role="img" aria-label={label ?? `${Math.min(used, holes)} of ${holes} used`} className={cn("flex flex-wrap gap-1.5", className)}>
      {Array.from({ length: holes }, (_, i) => {
        const on = i < used;
        return (
          <span
            key={i}
            className={cn(
              "relative size-3 rounded-full border",
              tone === "card" ? "border-line-strong bg-paper" : tone === "ink" ? "border-ink-line bg-ink" : "border-white/40 bg-white/10",
            )}
          >
            {on ? (
              <motion.span
                className={cn("absolute inset-[-1px] rounded-full", tone === "pass" ? "bg-white" : "bg-ink", tone === "ink" && "bg-on-ink")}
                initial={!mounted.current ? false : reduce ? { opacity: 0 } : { scale: 1.6, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                transition={reduce ? { duration: 0.2 } : SPRING_LANDING}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
