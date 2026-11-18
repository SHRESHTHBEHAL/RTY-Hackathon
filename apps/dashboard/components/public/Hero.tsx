"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Ban, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/Button";
import { GateLane, type GateLaneHandle } from "@/components/GateLane";
import { Guilloche } from "@/components/Guilloche";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import { PublicNav } from "./PublicNav";

const CENT = 10_000n;
const START = 1_000_000n; // $1.00, an example balance

/**
 * The landing hero. Its thesis is the gate lane, running by itself: one-cent
 * payments leave the agent's pass, the gate opens and the seller's balance
 * rolls; every fifth attempt is a $5.00 payment against a $2.00 limit, and
 * the gate refuses it. Labelled as an example: no one's real data.
 */
export function Hero() {
  const reduce = useReducedMotion() ?? false;
  const lane = useRef<GateLaneHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pass, setPass] = useState(START);
  const [owed, setOwed] = useState(0n);
  const [wide, setWide] = useState<boolean | null>(null);
  const step = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Runs only while the hero is on screen and the tab is visible.
  useEffect(() => {
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)), { threshold: 0.1 });
    if (box.current) io.observe(box.current);
    const tick = () => {
      if (!visible || document.hidden) return;
      const n = step.current++;
      if (n % 5 === 4) {
        void lane.current?.refuse("Over $2.00 limit", { amountMicros: "5000000" });
      } else {
        setPass((p) => (p >= CENT ? p - CENT : START));
        setOwed((o) => o + CENT);
        void lane.current?.approve({ amountMicros: CENT.toString() });
      }
    };
    const first = setTimeout(tick, 1000);
    const id = setInterval(tick, 1500);
    return () => {
      io.disconnect();
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const rise = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.slow, ease: EASE_OUT, delay: reduce ? 0 : delay },
  });
  const line = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { y: "105%" },
    animate: reduce ? { opacity: 1 } : { y: "0%" },
    transition: { duration: 0.42, ease: EASE_OUT, delay: reduce ? 0 : delay },
  });

  return (
    <section className="surface-ink relative isolate overflow-hidden" aria-labelledby="hero-title">
      {/* Engraving and light */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_78%_8%,rgba(47,75,255,0.22),transparent_70%)]" />
        <Guilloche size={980} opacity={0.075} className="absolute -right-[260px] -top-[300px] text-go-bright" />
        <Guilloche variant="seal" size={520} opacity={0.05} reverse className="absolute -left-[220px] top-[420px] text-pass-bright" />
      </div>

      <motion.div {...rise(0)}>
        <PublicNav onInk />
      </motion.div>

      <div className="mx-auto max-w-[1200px] px-4 pb-14 pt-8 sm:px-6 sm:pt-14 lg:pb-20">
        <motion.p {...rise(0.06)} className="eyebrow flex items-center gap-2 text-on-ink-soft!">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-go-bright shadow-[0_0_8px_var(--go-bright)]" />
          Test mode · no real money moves
        </motion.p>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-12">
          <h1 id="hero-title" className="font-display text-[clamp(56px,10.5vw,112px)] leading-[0.9] tracking-[-0.01em] text-on-ink">
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block" {...line(0.1)}>
                A payment{" "}
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block" {...line(0.16)}>
                gateway for{" "}
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block text-pass-bright" {...line(0.22)}>
                AI agents
              </motion.span>
            </span>
          </h1>

          <div className="lg:pb-3">
            <motion.p {...rise(0.3)} className="max-w-[460px] text-lg leading-relaxed text-on-ink-soft sm:text-xl sm:leading-relaxed">
              Give each of your agents a wallet with money in it. Sellers integrate Gaitway once, and your agents pay them on their own, up to their
              balance. No card, and no person in the loop.
            </motion.p>
            <motion.div {...rise(0.36)} className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup?as=business" size="lg">
                Sign up as a business
              </ButtonLink>
              <ButtonLink href="/signup?as=seller" size="lg" variant="secondary" onInk>
                Sign up as a seller
              </ButtonLink>
            </motion.div>
            <motion.div {...rise(0.42)}>
              <Link
                href="/demo"
                className="group mt-5 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-pass-bright hover-fine:text-on-ink"
              >
                Watch three agents pay, live
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden className="transition-transform duration-200 group-hover-fine:translate-x-0.5" />
              </Link>
            </motion.div>
          </div>
        </div>

        {/* The thesis */}
        <motion.figure {...rise(0.46)} ref={box} className="mt-12 sm:mt-16">
          <div className="rounded-[20px] border border-ink-line bg-[linear-gradient(180deg,rgba(18,48,58,0.55),rgba(11,31,36,0.2))] p-4 sm:p-6 lg:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
              <span className="font-display text-sm tracking-[0.12em] text-hold-bright">Example · test money</span>
              <span className="text-sm text-on-ink-soft">Each token is one payment</span>
            </div>
            {/* Sized once the viewport is known, so the lane never jumps from small to large. */}
            {wide === null ? (
              <div aria-hidden className="h-[168px] sm:h-[180px] lg:h-[228px]" />
            ) : (
              <GateLane
                ref={lane}
                size={wide ? "lg" : "md"}
                pass={{ name: "Scout", balanceMicros: pass.toString(), label: "Agent pass", id: "wal_example0000000000000000" }}
                seller={{ name: "Relay", balanceMicros: owed.toString(), label: "Seller" }}
              />
            )}
          </div>
          <figcaption className="mt-4 flex flex-col gap-2 text-[15px] text-on-ink-soft sm:flex-row sm:gap-8">
            <span className="inline-flex items-center gap-2">
              <Check size={18} strokeWidth={2.25} className="text-go-bright" aria-hidden />
              Approved: the gate opens and the seller is paid one cent.
            </span>
            <span className="inline-flex items-center gap-2">
              <Ban size={18} strokeWidth={2.25} className="text-stop-bright" aria-hidden />
              Refused: a $5.00 payment breaks a $2.00 limit, so nothing moves.
            </span>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
