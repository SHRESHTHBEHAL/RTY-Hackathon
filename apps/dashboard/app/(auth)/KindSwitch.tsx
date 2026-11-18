"use client";

import { motion, useReducedMotion } from "motion/react";
import { Bot, Store } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT } from "@/components/motion-tokens";

export type Kind = "business" | "seller";

const OPTIONS: Array<{ value: Kind; title: string; hint: string; icon: typeof Bot }> = [
  { value: "business", title: "Business", hint: "I run agents", icon: Bot },
  { value: "seller", title: "Seller", hint: "Agents pay me", icon: Store },
];

/** Radio group styled as two ticket halves with a sliding marker. */
export function KindSwitch({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  const reduce = useReducedMotion();
  const refs = useRef<Record<Kind, HTMLButtonElement | null>>({ business: null, seller: null });
  return (
    <div role="radiogroup" aria-label="Account type" className="relative grid grid-cols-2 gap-1 rounded-[12px] border border-line-strong bg-paper p-1">
      {OPTIONS.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[o.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                const next: Kind = value === "business" ? "seller" : "business";
                onChange(next);
                refs.current[next]?.focus();
              }
            }}
            className="pressable relative flex min-h-[60px] cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left sm:gap-3 sm:px-3"
          >
            {active ? (
              <motion.span
                layoutId="kind-marker"
                className="absolute inset-0 rounded-[9px] border border-line bg-card shadow-[0_1px_2px_rgba(11,31,36,0.08)]"
                transition={reduce ? { duration: 0 } : { duration: DUR.standard, ease: EASE_OUT }}
              />
            ) : null}
            <span
              className={cn(
                "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--dur-quick)]",
                active ? "bg-pass text-white" : "bg-ink/6 text-ink-soft",
              )}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="relative min-w-0">
              <span className={cn("block text-[15px] font-semibold leading-tight", active ? "text-ink" : "text-ink-soft")}>{o.title}</span>
              <span className="block text-[13px] leading-snug text-ink-soft">{o.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
