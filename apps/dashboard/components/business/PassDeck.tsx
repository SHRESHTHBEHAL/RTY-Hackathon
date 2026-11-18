"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import type { PassAgent } from "./PassCard";
import { PassCard } from "./PassCard";
import type { WalletBalance } from "./ledger";

/**
 * The agents' passes, dealt onto the table on first load: every pass starts
 * squared up in a stack on the first slot, tilted like cards in a hand, and
 * springs out to its own place one after another. A pass added later simply
 * rises into its slot. Once per page load; polling never re-deals.
 */
export function PassDeck({ agents, balances }: { agents: PassAgent[]; balances: Record<string, WalletBalance> }) {
  const reduce = useReducedMotion();
  // Filled after commit, so StrictMode's double render sees the same answer.
  const dealt = useRef<Set<string> | null>(null);
  const firstRender = dealt.current === null;
  const items = useRef(new Map<string, HTMLLIElement>());

  useLayoutEffect(() => {
    const els = agents.map((a) => items.current.get(a.id)).filter((x): x is HTMLLIElement => Boolean(x));
    if (els.length === 0) return;
    const origin = els[0]!.getBoundingClientRect();
    els.forEach((el, i) => {
      const n = Math.min(i, 6);
      const delay = 0.06 + n * 0.055;
      if (reduce) {
        void animate(el, { opacity: [0, 1] }, { duration: DUR.standard, delay: n * 0.03 });
        return;
      }
      const r = el.getBoundingClientRect();
      const dx = origin.left - r.left;
      const dy = origin.top - r.top;
      const tilt = [-5, 3, -2, 4, -3, 2, -4][i % 7]!;
      void animate(
        el,
        { x: [dx + n * 3, 0], y: [dy + 26 - n * 3, 0], rotate: [tilt, 0], scale: [0.97, 1], opacity: [0, 1] },
        { type: "spring", bounce: 0.2, duration: 0.45, delay, opacity: { duration: 0.12, delay } },
      );
    });
    // Deal once, on the first paint only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dealt.current ??= new Set();
    for (const a of agents) dealt.current.add(a.id);
  });

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Agent passes">
      <AnimatePresence initial={false}>
        {agents.map((a, i) => {
          const isNew = !firstRender && !dealt.current!.has(a.id);
          return (
            <motion.li
              key={a.id}
              ref={(el) => {
                if (el) items.current.set(a.id, el);
                else items.current.delete(a.id);
              }}
              layout={reduce ? false : "position"}
              initial={firstRender ? { opacity: 0 } : isNew ? (reduce ? { opacity: 0 } : { opacity: 0, y: 12 }) : false}
              animate={firstRender ? undefined : { opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
              transition={{ duration: DUR.slow, ease: EASE_OUT }}
              style={{ transformOrigin: "50% 100%", zIndex: agents.length - i }}
              className="relative"
            >
              <PassCard agent={a} balance={balances[a.walletId] ?? { available: "0", held: "0" }} quickAdd />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
