"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { Children, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT } from "./motion-tokens";

export type SectionRevealProps = {
  children: ReactNode;
  className?: string;
  /** Seconds between children. DESIGN.md: 0.04. */
  stagger?: number;
  as?: "div" | "section" | "ul" | "ol";
};

/**
 * Page-section entrance: each direct child rises 12px and fades in, 320ms,
 * 40ms apart, capped so the whole entrance ends within 400ms. Runs once on
 * mount; data refreshes re-render children without replaying it. Under
 * reduced motion it fades only.
 */
export function SectionReveal({ children, className, stagger = 0.04, as = "div" }: SectionRevealProps) {
  const reduce = useReducedMotion();
  const items = Children.toArray(children);
  const maxDelay = Math.max(0, 0.4 - DUR.slow);
  const Tag = motion[as];
  const item: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
    shown: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? DUR.standard : DUR.slow, ease: EASE_OUT, delay: Math.min(i * stagger, maxDelay) },
    }),
  };
  const ItemTag = as === "ul" || as === "ol" ? motion.li : motion.div;
  return (
    <Tag className={cn(className)} initial="hidden" animate="shown">
      {items.map((child, i) => (
        <ItemTag key={(child as { key?: string }).key ?? i} custom={i} variants={item}>
          {child}
        </ItemTag>
      ))}
    </Tag>
  );
}
