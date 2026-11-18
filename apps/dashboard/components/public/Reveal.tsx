"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { DUR, EASE_OUT } from "@/components/motion-tokens";

/**
 * Scroll reveal for landing sections: rises 16px and fades in once, when
 * the block is a fifth into view. Reduced motion: a short fade only.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduce ? DUR.standard : DUR.slow, ease: EASE_OUT, delay: reduce ? 0 : delay }}
    >
      {children}
    </Tag>
  );
}
