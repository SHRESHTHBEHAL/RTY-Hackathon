"use client";

import { ArrowDownToLine, ArrowUpFromLine, Lock } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/Button";
import { Guilloche } from "@/components/Guilloche";
import { Money } from "@/components/Money";
import { SPRING_LANDING } from "@/components/motion-tokens";
import { cn } from "@/lib/cn";
import { useLanding, useLedger } from "./ledger";

/**
 * The overview's hero: the whole balance in departure-board digits on ink,
 * and a strip that shows where the money sits right now (unallocated, on
 * passes, on hold). The unallocated readout is where tokens take off from.
 */
export function FareBox({ totalMicros }: { totalMicros: string }) {
  const { state } = useLedger();
  let onPasses = 0n;
  let held = 0n;
  for (const w of Object.values(state.wallets)) {
    onPasses += BigInt(w.available);
    held += BigInt(w.held);
  }
  const un = BigInt(state.unallocated);
  const sum = un + onPasses + held;
  // Shares for the strip only (display), never for money.
  const pct = (v: bigint) => (sum === 0n ? 0 : Number((v * 10_000n) / sum) / 100);

  return (
    <section aria-labelledby="farebox-title" className="surface-ink relative overflow-hidden rounded-[18px] px-5 py-7 sm:px-9 sm:py-9">
      <Guilloche size={620} opacity={0.08} className="absolute -right-40 -top-52 text-go-bright" />
      <Guilloche variant="band" size={520} opacity={0.05} reverse className="absolute -bottom-64 -left-40 text-on-ink-soft" />
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p id="farebox-title" className="eyebrow text-on-ink-soft!">
            Total balance
          </p>
          <div className="mt-3 text-on-ink" data-testid="total-balance">
            <Money micros={totalMicros} size="2xl" rolling className="text-[64px]! sm:text-[96px]! lg:text-[112px]!" />
          </div>
          <p className="mt-3 max-w-md text-[15px] text-on-ink-soft">Everything you hold with Gaitway: money not yet given to an agent, money on agents' passes, and money on hold for open sessions.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ButtonLink href="/business/funds" icon={<ArrowDownToLine size={18} strokeWidth={1.75} aria-hidden />}>
            Top up
          </ButtonLink>
          <ButtonLink href="/business/funds/withdraw" variant="secondary" onInk icon={<ArrowUpFromLine size={18} strokeWidth={1.75} aria-hidden />}>
            Withdraw
          </ButtonLink>
        </div>
      </div>

      <div className="relative mt-9">
        <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label={`Unallocated ${pct(un)} percent, on passes ${pct(onPasses)} percent, on hold ${pct(held)} percent`}>
          {sum === 0n ? (
            <span className="h-full w-full rounded-full bg-white/10" />
          ) : (
            <>
              <span className="h-full rounded-l-full bg-on-ink" style={{ width: `${pct(un)}%` }} />
              <span className="h-full bg-pass-bright" style={{ width: `${pct(onPasses)}%` }} />
              <span className="h-full rounded-r-full bg-hold-bright" style={{ width: `${pct(held)}%` }} />
            </>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-5 min-[480px]:grid-cols-3">
          <Readout label="Unallocated" swatch="bg-on-ink" micros={state.unallocated} ledgerKey="unallocated" testId="unallocated-balance" hint="Ready to give to an agent" />
          <Readout label="On passes" swatch="bg-pass-bright" micros={onPasses.toString()} hint="Agents can spend this" />
          <Readout label="On hold" swatch="bg-hold-bright" micros={held.toString()} icon hint="Reserved for open sessions" />
        </dl>
      </div>
    </section>
  );
}

function Readout({
  label,
  swatch,
  micros,
  ledgerKey,
  testId,
  hint,
  icon,
}: {
  label: string;
  swatch: string;
  micros: string;
  ledgerKey?: string;
  testId?: string;
  hint: string;
  icon?: boolean;
}) {
  const landing = useLanding(ledgerKey ?? "-");
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!ledgerKey || landing === 0 || reduce) return;
    controls.set({ y: 4 });
    void controls.start({ y: 0, transition: SPRING_LANDING });
  }, [landing, ledgerKey, controls, reduce]);

  return (
    <div className="min-w-0 border-t border-ink-line pt-3">
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-on-ink-soft">
        <span className={cn("size-2 rounded-full", swatch)} aria-hidden />
        {label}
        {icon ? <Lock size={12} strokeWidth={2} aria-hidden /> : null}
      </dt>
      <dd className="mt-2">
        <motion.span animate={controls} className="inline-block text-on-ink" data-ledger={ledgerKey} data-testid={testId}>
          <Money micros={micros} size="md" rolling />
        </motion.span>
        <span className="mt-1 block text-[13px] text-on-ink-soft">{hint}</span>
      </dd>
    </div>
  );
}
