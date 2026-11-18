"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Money } from "@/components/Money";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import type { Transaction } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { describeTx } from "./describe";

const toneClass = {
  in: "border-go/30 bg-go/10 text-go-text",
  out: "border-line-strong bg-paper text-ink",
  move: "border-pass/25 bg-pass/8 text-pass",
  hold: "border-hold/35 bg-hold/10 text-hold-text",
} as const;

/**
 * Recent ledger entries in plain sentences. Rows that arrive on a poll slide
 * down from the top and push the rest with a layout animation; a refresh
 * that changes nothing moves nothing.
 */
export function ActivityFeed({ rows, names }: { rows: Transaction[]; names: Record<string, string> }) {
  const reduce = useReducedMotion();
  const seen = useRef<Set<string> | null>(null);
  const known = seen.current;
  useEffect(() => {
    seen.current ??= new Set();
    for (const r of rows) seen.current.add(r.id);
  });
  // Relative times tick without a refetch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <ol className="divide-y divide-line" aria-label="Recent activity">
      <AnimatePresence initial={false}>
        {rows.map((tx) => {
          const w = describeTx(tx, names);
          const Icon = w.icon;
          const isNew = known !== null && !known.has(tx.id);
          return (
            <motion.li
              key={tx.id}
              layout={reduce ? false : "position"}
              initial={isNew ? (reduce ? { opacity: 0 } : { opacity: 0, y: -14 }) : false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
              transition={{ duration: DUR.standard, ease: EASE_OUT }}
              className="flex items-center gap-3 py-3.5 sm:gap-4"
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full border", toneClass[w.tone])}>
                <Icon size={18} strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink sm:text-base" title={w.title}>
                  {w.title}
                </p>
                <p className="text-sm text-ink-soft">
                  <time dateTime={tx.createdAt} title={formatDateTime(tx.createdAt)}>
                    {now === null ? formatDateTime(tx.createdAt) : formatRelative(tx.createdAt, now)}
                  </time>
                </p>
              </div>
              <Money
                micros={tx.amountMicros}
                variant="mono"
                signed
                className={cn("shrink-0 text-[14px]", tx.type === "topup" || tx.type === "refund" ? "text-go-text" : "text-ink")}
              />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
