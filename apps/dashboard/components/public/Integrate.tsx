"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import { cn } from "@/lib/cn";
import { CodeBlock } from "./CodeBlock";
import { Reveal } from "./Reveal";
import { AGENT_SNIPPET, SELLER_SNIPPET } from "./snippets";
import { useReduce } from "./useReduce";

const TABS = [
  {
    id: "seller",
    label: "Seller",
    title: "Charge an agent one cent per request",
    file: "server.ts",
    code: SELLER_SNIPPET,
    points: [
      "With no valid credential, the middleware answers HTTP 402 with a Gaitway body.",
      "With one, it charges the price first, then runs your handler.",
      "A retried request, with the same gaitway-request-id header, is charged once.",
    ],
    link: { href: "/docs#seller-quickstart", label: "Seller quickstart" },
  },
  {
    id: "agent",
    label: "Agent",
    title: "Pay with one call that works like fetch",
    file: "agent.ts",
    code: AGENT_SNIPPET,
    points: [
      "On a Gaitway 402 it opens a credential for that seller, retries once, and reuses it.",
      "A second 402 after paying throws payment_failed. It never tries a third time.",
      "An empty balance throws insufficient_funds, before anything is sent.",
    ],
    link: { href: "/docs#agent-quickstart", label: "Agent quickstart" },
  },
] as const;

export function Integrate() {
  const [tab, setTab] = useState(0);
  const reduce = useReduce();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const t = TABS[tab]!;

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (tab + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <section aria-labelledby="code-title" className="border-b border-line bg-card">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">For developers</p>
            <h2 id="code-title" className="font-display mt-3 text-[40px] text-ink sm:text-[56px]">
              Roughly twenty lines to start charging
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              One package, <code className="rounded-[6px] bg-paper px-1.5 py-0.5 font-mono text-[0.9em]">@gaitway/sdk</code>, for both ends of
              the payment. Amounts are micros strings: <code className="font-mono text-[0.9em]">&quot;10000&quot;</code> is one cent.
            </p>
          </div>
          <div role="tablist" aria-label="Code for" className="inline-flex shrink-0 rounded-[12px] border border-line bg-paper p-1" onKeyDown={onKey}>
            {TABS.map((x, i) => (
              <button
                key={x.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                id={`tab-${x.id}`}
                aria-selected={tab === i}
                aria-controls={`panel-${x.id}`}
                tabIndex={tab === i ? 0 : -1}
                onClick={() => setTab(i)}
                className="pressable relative h-11 cursor-pointer rounded-[9px] px-5 text-[15px] font-semibold"
              >
                {tab === i ? (
                  <motion.span
                    layoutId="code-tab"
                    className="absolute inset-0 rounded-[9px] bg-ink"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
                  />
                ) : null}
                <span className={cn("relative transition-colors duration-200", tab === i ? "text-on-ink" : "text-ink-soft")}>{x.label}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.06} className="mt-10">
          <div role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={t.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.quick } }}
                transition={{ duration: DUR.standard, ease: EASE_OUT }}
                className="lg:pt-2"
              >
                <h3 className="font-display text-[32px] text-ink">{t.title}</h3>
                <ul className="mt-5 space-y-3.5">
                  {t.points.map((p) => (
                    <li key={p} className="flex gap-3 text-[16px] leading-relaxed text-ink">
                      <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-go" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href={t.link.href} className="group mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-pass">
                  {t.link.label}
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden className="transition-transform duration-200 group-hover-fine:translate-x-0.5" />
                </Link>
              </motion.div>
            </AnimatePresence>
            <div className="min-w-0">
              <CodeBlock code={t.code} title={t.file} copyLabel={`Copy the ${t.label.toLowerCase()} snippet`} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
