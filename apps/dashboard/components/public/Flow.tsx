"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Clock3, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Money } from "@/components/Money";
import { DUR, EASE_IN_OUT, EASE_OUT, SPRING, SPRING_LANDING } from "@/components/motion-tokens";
import { Punches } from "@/components/Punches";
import { cn } from "@/lib/cn";
import { useReduce } from "./useReduce";

/** context.md section 2, steps 3 to 8, in the interface's words. */
const STEPS = [
  {
    name: "Authorise",
    body: "The agent asks Gaitway for a credential that names one seller and a maximum. That maximum goes on hold in its wallet, so it cannot be spent twice.",
  },
  {
    name: "Present",
    body: "The agent calls the seller with the credential in the gaitway-token header. A credential is a session with one seller.",
  },
  {
    name: "Verify",
    body: "The seller's SDK checks the signature, the audience and the expiry on its own server, against Gaitway's public keys.",
  },
  {
    name: "Charge, then deliver",
    body: "The seller charges the credential through the API and delivers only once the charge is confirmed. Each charge punches the ticket; it can be charged again until its maximum is used.",
  },
  {
    name: "Release",
    body: "What is left on hold goes back to the wallet when the credential expires, when the agent releases it, or when the seller marks a charge final.",
  },
  {
    name: "Settle",
    body: "A scheduled job pays every seller in one batch. The seller sees a payout; nobody pays a network fee.",
  },
];

/** Example numbers for the illustration: one credential of $1.00, three one-cent charges. */
const FRAMES = [
  { available: "49000000", held: "1000000", punched: 0, remaining: "1000000", owed: "0", paid: "0" },
  { available: "49000000", held: "1000000", punched: 0, remaining: "1000000", owed: "0", paid: "0" },
  { available: "49000000", held: "1000000", punched: 0, remaining: "1000000", owed: "0", paid: "0" },
  { available: "49000000", held: "970000", punched: 3, remaining: "970000", owed: "30000", paid: "0" },
  { available: "49970000", held: "0", punched: 3, remaining: "0", owed: "30000", paid: "0" },
  { available: "49970000", held: "0", punched: 3, remaining: "0", owed: "0", paid: "30000" },
];

export function Flow() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-4 border-b border-line bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="max-w-2xl">
          <p className="eyebrow">Payment flow</p>
          <h2 id="how-title" className="font-display mt-3 text-[40px] text-ink sm:text-[56px]">
            How a payment works
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            Before any of this, the business tops up and moves money into the agent&apos;s wallet. Then every payment takes the same six steps.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-x-16 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-28">
        {/* Sticky stage */}
        <div className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-4 backdrop-blur-[6px] sm:-mx-6 sm:px-6 lg:top-[12vh] lg:mx-0 lg:flex lg:h-[76vh] lg:flex-col lg:justify-center lg:bg-transparent lg:px-0 lg:pt-6 lg:backdrop-blur-none">
          <Stage step={active} />
        </div>

        {/* Steps */}
        <ol className="relative lg:pt-[18vh]">
          {STEPS.map((s, i) => (
            <li
              key={s.name}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-step={i}
              className="relative flex min-h-[46vh] gap-5 py-8 lg:min-h-[62vh] lg:py-0"
              aria-current={active === i ? "step" : undefined}
            >
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "font-display flex size-11 shrink-0 items-center justify-center rounded-full border text-xl transition-colors duration-200",
                    active === i ? "border-pass bg-pass text-white" : active > i ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-card text-ink-soft",
                  )}
                >
                  {i + 1}
                </span>
                {i < STEPS.length - 1 ? <span aria-hidden className="mt-2 w-px flex-1 bg-[repeating-linear-gradient(to_bottom,var(--line-strong)_0_6px,transparent_6px_11px)]" /> : null}
              </div>
              <div className={cn("pt-1.5 transition-opacity duration-200", active === i ? "opacity-100" : "opacity-55 lg:opacity-45")}>
                <h3 className="font-display text-[32px] text-ink sm:text-[40px]">{s.name}</h3>
                <p className="mt-3 max-w-md text-[17px] leading-relaxed text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The stage: a wallet pass, a credential ticket and the seller.       */
/* ------------------------------------------------------------------ */

function Stage({ step }: { step: number }) {
  const reduce = useReduce();
  const f = FRAMES[step]!;
  const presented = step >= 1;
  const released = step >= 4;
  const t = (d = 0) => ({ duration: DUR.slow, ease: EASE_OUT, delay: d });

  return (
    <figure className="relative w-full" aria-label={`Example of step ${step + 1}: ${STEPS[step]!.name}`}>
      <div className="flex items-center justify-between">
        <span className="font-display text-sm tracking-[0.12em] text-hold-text">Example</span>
        <span className="font-mono text-xs text-ink-soft">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:mt-5 lg:gap-4">
        {/* Wallet */}
        <div className="surface-ink rounded-[14px] border border-ink-line p-3.5 lg:p-5">
          <p className="eyebrow text-on-ink-soft!">Scout&apos;s wallet</p>
          <Money micros={f.available} rolling size="md" className="mt-1.5 text-on-ink lg:text-3xl!" />
          <p className={cn("mt-1 flex items-center gap-1.5 text-sm transition-colors duration-200", BigInt(f.held) > 0n ? "text-hold-bright" : "text-on-ink-soft")}>
            <Clock3 size={14} strokeWidth={1.75} aria-hidden />
            On hold <Money micros={f.held} variant="mono" rolling className="text-inherit" />
          </p>
        </div>
        {/* Seller */}
        <div className="rounded-[14px] border border-line bg-card p-3.5 lg:p-5">
          <p className="eyebrow">Relay, the seller</p>
          <Money micros={f.owed} rolling size="md" className="mt-1.5 text-go-text lg:text-3xl!" />
          <p className="mt-1 text-sm text-ink-soft">
            Owed · paid out <Money micros={f.paid} variant="mono" rolling />
          </p>
        </div>
      </div>

      {/* Lane between them, carrying the credential */}
      <div className="relative mt-3 h-[150px] lg:mt-6 lg:h-[230px]">
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[repeating-linear-gradient(to_right,var(--line-strong)_0_8px,transparent_8px_16px)]" />
        {/* Gate: the seller's door, where verification happens */}
        <div aria-hidden className="absolute left-[68%] top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="mb-1 block h-5 w-7 rounded-[5px_5px_2px_2px] border border-line-strong bg-card" />
          <motion.span
            className={cn("mb-3 block h-9 w-[6px] rounded-full transition-colors duration-200 lg:mb-4 lg:h-14", step === 2 ? "bg-go" : "bg-ink")}
            style={{ transformOrigin: "50% 0%" }}
            animate={{ rotate: step >= 3 && !reduce ? -64 : 0 }}
            transition={SPRING}
          />
          <motion.span
            className={cn("block h-9 w-[6px] rounded-full transition-colors duration-200 lg:h-14", step === 2 ? "bg-go" : "bg-ink")}
            style={{ transformOrigin: "50% 100%" }}
            animate={{ rotate: step >= 3 && !reduce ? 64 : 0 }}
            transition={SPRING}
          />
          <span className="mt-1 block h-5 w-7 rounded-[2px_2px_5px_5px] border border-line-strong bg-card" />
        </div>

        {/* The credential ticket */}
        <motion.div
          className="absolute left-0 top-1/2 w-[62%] max-w-[300px] lg:w-[58%]"
          initial={false}
          animate={{
            x: reduce ? 0 : presented && !released ? (step >= 3 ? "12%" : "6%") : "0%",
            y: "-50%",
            opacity: released ? 0.55 : 1,
          }}
          transition={{ duration: 0.5, ease: EASE_IN_OUT }}
        >
          <div className="ticket" data-tone="card">
            <div className="ticket-head">
              <div className="ticket-fill p-3 pb-2.5 lg:p-4 lg:pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">Credential</span>
                  <span className={cn("font-mono text-[11px] text-ink-soft transition-opacity duration-200", released && "opacity-0")}>to Relay</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <Money micros={f.remaining} rolling size="sm" className="text-ink lg:text-2xl!" />
                  <span className="text-xs text-ink-soft">of $1.00 left</span>
                </div>
                <Punches total={10} used={f.punched} className="mt-2.5" label={`${f.punched} charges`} />
              </div>
            </div>
            <div className="ticket-stub">
              <div className="ticket-fill flex h-9 items-center px-3 lg:h-10 lg:px-4">
                <span className="truncate font-mono text-[11px] text-ink-soft">gaitway-token: eyJhbGciOiJFUzI1NiIs…</span>
              </div>
            </div>
          </div>
          {/* Stamp */}
          <AnimatePresence>
            {released ? (
              <motion.span
                key="released"
                className="font-display absolute right-3 top-3 rotate-[-8deg] rounded-[6px] border-2 border-ink-soft px-2 py-0.5 text-sm tracking-[0.08em] text-ink-soft"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.25 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={reduce ? t() : SPRING_LANDING}
              >
                Released
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.div>

        {/* Step badges near the gate */}
        <div className="absolute right-0 top-0 flex w-[30%] flex-col items-end gap-1.5 lg:gap-2">
          <AnimatePresence mode="popLayout">
            {step === 2
              ? ["Signature", "Audience", "Expiry"].map((c, i) => (
                  <motion.span
                    key={c}
                    className="inline-flex items-center gap-1.5 rounded-full border border-go/30 bg-go/10 px-2.5 py-1 text-xs font-semibold text-go-text"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: { duration: DUR.quick } }}
                    transition={t(i * 0.08)}
                  >
                    <Check size={14} strokeWidth={2.5} aria-hidden />
                    {c}
                  </motion.span>
                ))
              : null}
            {step === 2 ? (
              <motion.span key="local" className="text-xs text-ink-soft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t(0.26)}>
                <ShieldCheck size={14} strokeWidth={1.75} className="mr-1 inline" aria-hidden />
                checked locally
              </motion.span>
            ) : null}
            {step === 3 ? (
              <motion.span
                key="delivered"
                className="inline-flex items-center gap-1.5 rounded-full border border-go/30 bg-go/10 px-2.5 py-1 text-xs font-semibold text-go-text"
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.quick } }}
                transition={t(0.3)}
              >
                <PackageCheck size={14} strokeWidth={1.75} aria-hidden />
                Charged, then delivered
              </motion.span>
            ) : null}
            {step === 5 ? (
              <motion.span
                key="payout"
                className="inline-flex items-center gap-1.5 rounded-full border border-pass/25 bg-pass/8 px-2.5 py-1 text-xs font-semibold text-pass"
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.quick } }}
                transition={t(0.1)}
              >
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
                Payout sent
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <figcaption className="sr-only">
        {STEPS[step]!.name}. Example balances: Scout has the available and held amounts shown; Relay is owed and paid out the amounts shown.
      </figcaption>
    </figure>
  );
}
