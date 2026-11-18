"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, exitOf } from "./motion-tokens";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export type RollingNumberProps = {
  /** Any pre-formatted string, e.g. "$1,234.56". Digits roll; other characters sit still. */
  value: string;
  className?: string;
  /** Seconds between neighbouring digits, starting from the right. */
  stagger?: number;
  /** Screen-reader text; defaults to `value`. */
  label?: string;
};

/**
 * Departure-board digits. Each digit is a vertical strip 0–9 that rolls to
 * its new value with the standard spring, 30ms apart from the right. Cells
 * are keyed from the right so a growing number keeps its existing digits in
 * place. Width is fixed per cell, so nothing shifts while rolling. Under
 * reduced motion the whole value cross-fades instead.
 */
export function RollingNumber({ value, className, stagger = 0.03, label }: RollingNumberProps) {
  const reduce = useReducedMotion();
  const chars = [...value];
  const n = chars.length;

  return (
    <span className={cn("relative inline-flex whitespace-nowrap tabular", className)}>
      <span className="sr-only">{label ?? value}</span>
      {reduce ? (
        <span aria-hidden className="relative inline-grid">
          <AnimatePresence initial={false}>
            <motion.span
              key={value}
              className="[grid-area:1/1]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: DUR.standard } }}
              exit={{ opacity: 0, transition: { duration: exitOf(DUR.standard) } }}
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : (
        <span aria-hidden className="inline-flex">
          <AnimatePresence initial={false} mode="popLayout">
            {chars.map((ch, i) => {
              const fromRight = n - 1 - i;
              const isDigit = ch >= "0" && ch <= "9";
              return isDigit ? (
                <DigitCell key={`d${fromRight}`} digit={Number(ch)} delay={fromRight * stagger} />
              ) : (
                <motion.span
                  key={`c${fromRight}${ch}`}
                  className="inline-block"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: DUR.standard, ease: EASE_OUT } }}
                  exit={{ opacity: 0, transition: { duration: exitOf(DUR.standard) } }}
                >
                  {ch}
                </motion.span>
              );
            })}
          </AnimatePresence>
        </span>
      )}
    </span>
  );
}

function DigitCell({ digit, delay, ref }: { digit: number; delay: number; ref?: React.Ref<HTMLSpanElement> }) {
  return (
    <motion.span
      ref={ref}
      className="relative inline-block overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DUR.standard, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: exitOf(DUR.standard) } }}
    >
      {/* Sizer: one "0" fixes the cell's width and height. */}
      <span className="invisible block">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={false}
        animate={{ y: `${-digit * 10}%` }}
        transition={{ type: "spring", bounce: 0, duration: 0.4, delay }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block">
            {d}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}
