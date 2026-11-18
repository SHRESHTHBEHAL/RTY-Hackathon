"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { RollingNumber } from "@/components/RollingNumber";
import { SPRING } from "@/components/motion-tokens";
import type { ChartDay } from "./result";

const H = 120;
const W = 40;

function label(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return {
    short: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d),
    long: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(d),
  };
}

/**
 * Charges per day as seven ticket stubs, each with a punched hole. Bars grow
 * from the baseline with a transform only; a new count springs to its height.
 * Every bar is focusable and named; a screen-reader table sits behind it.
 */
export function BarChart({ days }: { days: ChartDay[] }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const last = days.length - 1;

  return (
    <div>
      <figure aria-label={`Charges per day, last seven days: ${total} in total`} className="m-0">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          {days.map((d, i) => {
            const l = label(d.day);
            const ratio = d.count / max;
            const isToday = i === last;
            return (
              <div
                key={d.day}
                tabIndex={0}
                role="img"
                aria-label={`${l.long}: ${d.count} ${d.count === 1 ? "charge" : "charges"}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group flex min-w-0 flex-col items-center rounded-[10px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-pass"
              >
                <span className={cn("mb-1.5 font-mono text-[13px] tabular", isToday ? "font-medium text-ink" : "text-ink-soft", active === i && "text-ink")}>
                  <RollingNumber value={String(d.count)} />
                </span>
                <svg viewBox={`0 0 ${W} ${H}`} className="block w-full max-w-[44px]" aria-hidden preserveAspectRatio="xMidYMax meet">
                  {/* the perforated baseline slot every stub drops out of */}
                  <rect x="4" y="0" width={W - 8} height={H} rx="6" className="fill-ink/[0.04]" />
                  {d.count > 0 ? (
                    <motion.g
                      style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
                      initial={reduce ? { opacity: 0 } : { scaleY: 0.02 }}
                      animate={reduce ? { opacity: 1 } : { scaleY: 1 }}
                      transition={{ ...SPRING, delay: reduce ? 0 : i * 0.04 }}
                    >
                      <motion.rect
                        x="4"
                        y={H - H * ratio}
                        width={W - 8}
                        height={Math.max(H * ratio, 4)}
                        rx="6"
                        className={cn("transition-[fill] duration-[120ms]", isToday ? "fill-pass" : "fill-pass/70", active === i && "fill-pass")}
                        layout={false}
                        animate={{ y: H - Math.max(H * ratio, 4), height: Math.max(H * ratio, 4) }}
                        transition={reduce ? { duration: 0 } : SPRING}
                      />
                    </motion.g>
                  ) : (
                    <line x1="4" x2={W - 4} y1={H - 1} y2={H - 1} strokeDasharray="3 3" strokeWidth="2" className="stroke-line-strong" />
                  )}
                </svg>
                <span className={cn("mt-2 text-xs font-semibold uppercase tracking-[0.06em]", isToday ? "text-ink" : "text-ink-soft")}>{isToday ? "Today" : l.short}</span>
              </div>
            );
          })}
        </div>
        <div aria-hidden className="mt-3 border-t border-dashed border-line-strong" />
      </figure>
      <table className="sr-only">
        <caption>Charges per day (UTC days)</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Charges</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{label(d.day).long}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
