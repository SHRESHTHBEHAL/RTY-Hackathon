"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Inbox, WifiOff } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { RollingNumber } from "@/components/RollingNumber";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { TicketCard } from "@/components/TicketCard";
import { DUR, EASE_OUT, SPRING, exitOf } from "@/components/motion-tokens";
import { formatRelative, shortId } from "@/lib/format";
import { chartAction, overviewAction } from "@/app/seller/actions";
import { BarChart } from "./BarChart";
import { usePolled, useNow } from "./hooks";
import type { ChartDay, OverviewData } from "./result";

export function Overview({ initial, chart, asOf }: { initial: OverviewData; chart: ChartDay[]; asOf: number }) {
  const { data, stale, beat } = usePolled(initial, overviewAction, 3000);
  const { data: days } = usePolled(chart, chartAction, 30_000);
  const now = useNow(asOf);
  const reduce = useReducedMotion();

  return (
    <SectionReveal>
      <PageHeader
        eyebrow="Seller"
        title="Overview"
        description="What agents owe you, what has reached you, and the charges as they arrive."
        meta={
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft" role="status">
            {stale ? (
              <>
                <WifiOff size={16} strokeWidth={1.75} className="text-hold-text" aria-hidden />
                <span className="text-hold-text">Reconnecting. Showing the last numbers we had.</span>
              </>
            ) : (
              <>
                <span className="relative flex size-2.5 items-center justify-center" aria-hidden>
                  <motion.span
                    key={beat}
                    className="absolute size-2.5 rounded-full bg-go"
                    initial={reduce || beat === 0 ? false : { scale: 2.2, opacity: 0.35 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: EASE_OUT }}
                  />
                </span>
                Live. Updates every 3 seconds.
              </>
            )}
          </span>
        }
        action={
          <ButtonLink href="/seller/services" variant="secondary">
            Manage services
          </ButtonLink>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <TicketCard
          tone="pass"
          guilloche
          as="section"
          aria-label="Amount owed"
          stub={<span>Collected from agents. Included in your next payout.</span>}
        >
          <p className="eyebrow text-white/80!">Owed to you</p>
          <div className="mt-5 text-white">
            <Money micros={data.owedMicros} size="xl" rolling />
          </div>
        </TicketCard>
        <TicketCard tone="card" as="section" aria-label="Amount paid out" stub={<span>Sent to you in payouts so far.</span>}>
          <p className="eyebrow">Paid out</p>
          <div className="mt-5">
            <Money micros={data.paidOutMicros} size="xl" rolling />
          </div>
        </TicketCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card
          title="Recent charges"
          actions={
            <Link href="/seller/charges" className="pressable inline-flex h-11 items-center text-sm font-semibold text-pass hover-fine:underline">
              All charges
            </Link>
          }
        >
          {data.recent.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Inbox}
              title="No charges yet"
              body="Charges appear here the moment an agent pays you."
              action={
                <ButtonLink href="/seller/developers" variant="secondary">
                  See how to integrate
                </ButtonLink>
              }
            />
          ) : (
            <ul aria-label="Recent charges" className="-my-1">
              <AnimatePresence initial={false}>
                {data.recent.map((c) => (
                  <motion.li
                    key={c.id}
                    layout={reduce ? false : "position"}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: exitOf(DUR.standard) } }}
                    transition={{ ...SPRING, opacity: { duration: DUR.standard, ease: EASE_OUT } }}
                    className="relative flex items-center gap-3 border-b border-line py-3.5 last:border-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-go/30 bg-go/10 text-go-text">
                      <Check size={16} strokeWidth={2.25} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[14px] tabular text-ink" title={c.agentId}>
                        {shortId(c.agentId)}
                      </p>
                      <p className="truncate text-sm text-ink-soft">
                        {c.description ?? "Charge"}
                        <span suppressHydrationWarning> · {formatRelative(c.createdAt, now)}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-medium text-go-text">
                        <Money micros={c.amountMicros} variant="mono" signed />
                      </p>
                      {c.refundedMicros !== "0" ? (
                        <p className="text-xs text-ink-soft">
                          Refunded <Money micros={c.refundedMicros} variant="mono" />
                        </p>
                      ) : null}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>

        <Card title="Charges per day">
          {days.every((d) => d.count === 0) ? (
            <EmptyState size="compact" icon={Inbox} title="Nothing in the last 7 days" body="Each day gets a stub as soon as an agent pays you." />
          ) : (
            <>
              <p className="mb-6 flex items-baseline gap-2 text-ink">
                <span className="font-display text-3xl">
                  <RollingNumber value={String(days.reduce((n, d) => n + d.count, 0))} />
                </span>
                <span className="text-[15px] text-ink-soft">charges in 7 days</span>
              </p>
              <BarChart days={days} />
            </>
          )}
          <p className="mt-4 text-xs text-ink-soft">Last 7 days, counted in UTC.</p>
        </Card>
      </div>
    </SectionReveal>
  );
}
