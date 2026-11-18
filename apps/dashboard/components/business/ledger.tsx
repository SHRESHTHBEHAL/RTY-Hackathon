"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EASE_IN_OUT, EASE_OUT } from "@/components/motion-tokens";
import type { Wallet } from "@/lib/api/types";
import type { LedgerState, WalletBalance } from "./ledger-state";

/**
 * The business's money as shown on screen: the unallocated balance and each
 * pass. Server data arrives through `server` (and every poll); a money move
 * plays out locally first so the story reads in order: the source rolls
 * down, a token travels across the screen, and the destination rolls up the
 * moment it lands. Then the page refetches the truth.
 *
 * Anchors: any element with data-ledger="unallocated" or data-ledger={walletId}.
 */

export type { LedgerState, WalletBalance } from "./ledger-state";

type Flight = { id: number; from: { x: number; y: number }; to: { x: number; y: number }; onLand: () => void };

type Ctx = {
  state: LedgerState;
  landings: Record<string, number>;
  move: (direction: "to_wallet" | "to_unallocated", result: { unallocatedMicros: string; wallet: Wallet }) => void;
};

const LedgerContext = createContext<Ctx | null>(null);

function anchorCentre(key: string): { x: number; y: number } | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-ledger="${CSS.escape(key)}"]`);
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

export function LedgerProvider({ server, children }: { server: LedgerState; children: ReactNode }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [state, setState] = useState(server);
  const [landings, setLandings] = useState<Record<string, number>>({});
  const [flights, setFlights] = useState<Flight[]>([]);
  const [mounted, setMounted] = useState(false);
  const flying = useRef(0);
  const nextId = useRef(1);
  const serverKey = JSON.stringify(server);

  useEffect(() => setMounted(true), []);

  // Accept fresh server numbers, except mid-flight (the landing applies them).
  useEffect(() => {
    if (flying.current === 0) setState(JSON.parse(serverKey) as LedgerState);
  }, [serverKey]);

  const bump = useCallback((key: string) => setLandings((l) => ({ ...l, [key]: (l[key] ?? 0) + 1 })), []);

  const move = useCallback<Ctx["move"]>(
    (direction, result) => {
      const wid = result.wallet.walletId;
      const setWallet = () =>
        setState((s) => ({ ...s, wallets: { ...s.wallets, [wid]: { available: result.wallet.availableMicros, held: result.wallet.heldMicros } } }));
      const setUnallocated = () => setState((s) => ({ ...s, unallocated: result.unallocatedMicros }));
      const [fromKey, toKey] = direction === "to_wallet" ? ["unallocated", wid] : [wid, "unallocated"];
      const [first, second] = direction === "to_wallet" ? [setUnallocated, setWallet] : [setWallet, setUnallocated];

      const from = reduce ? null : anchorCentre(fromKey);
      const to = reduce ? null : anchorCentre(toKey);
      first();
      if (!from || !to) {
        second();
        bump(toKey);
        router.refresh();
        return;
      }
      flying.current += 1;
      const id = nextId.current++;
      setFlights((f) => [
        ...f,
        {
          id,
          from,
          to,
          onLand: () => {
            second();
            bump(toKey);
            setFlights((all) => all.filter((x) => x.id !== id));
            flying.current -= 1;
            router.refresh();
          },
        },
      ]);
    },
    [reduce, router, bump],
  );

  const value = useMemo(() => ({ state, landings, move }), [state, landings, move]);

  return (
    <LedgerContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div aria-hidden className="pointer-events-none fixed inset-0 z-[55]">
              <AnimatePresence>
                {flights.map((f) => (
                  <TokenFlight key={f.id} flight={f} />
                ))}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </LedgerContext.Provider>
  );
}

/** A pass-blue fare token with the gate mark, flying on a shallow arc. */
function TokenFlight({ flight }: { flight: Flight }) {
  const { from, to } = flight;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(140, 40 + dist * 0.22);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const duration = Math.min(0.85, 0.5 + dist / 2400);
  // x glides across; y rises then falls like a thrown coin (a parabola).
  const path = { x: [from.x, to.x], y: [from.y, mid.y, to.y] };
  const tr = (delay = 0) => ({
    duration,
    delay,
    x: { duration, delay, ease: EASE_IN_OUT },
    y: { duration, delay, ease: [EASE_OUT, EASE_IN_OUT], times: [0, 0.5, 1] },
    times: [0, 0.5, 1],
  });
  const ghosts = [0.06, 0.12];
  const landed = useRef(false);
  return (
    <>
      {ghosts.map((delay, i) => (
        <motion.span
          key={i}
          className="absolute left-0 top-0 -ml-2 -mt-2 size-4 rounded-full bg-pass"
          initial={{ x: from.x, y: from.y, opacity: 0 }}
          animate={{ ...path, opacity: [0, i === 0 ? 0.32 : 0.16, 0], scale: [0.6, 0.9, 0.5] }}
          transition={tr(delay)}
        />
      ))}
      <motion.span
        className="absolute left-0 top-0 -ml-[13px] -mt-[13px] flex size-[26px] items-center justify-center gap-[3px] rounded-full bg-pass shadow-[0_6px_16px_-4px_rgba(47,75,255,0.6),inset_0_0_0_2px_rgba(255,255,255,0.28)]"
        initial={{ x: from.x, y: from.y, scale: 0.7, opacity: 0 }}
        animate={{ ...path, scale: [0.7, 1.12, 0.92], opacity: [0, 1, 1] }}
        exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
        transition={tr()}
        onAnimationComplete={() => {
          if (landed.current) return;
          landed.current = true;
          flight.onLand();
        }}
      >
        <span className="h-2.5 w-[3px] rounded-full bg-white" />
        <span className="h-2.5 w-[3px] rounded-full bg-white" />
      </motion.span>
    </>
  );
}

function useLedgerCtx(): Ctx {
  const c = useContext(LedgerContext);
  if (!c) throw new Error("LedgerProvider missing");
  return c;
}

export function useLedger() {
  return useLedgerCtx();
}

export function useUnallocated(): string {
  return useLedgerCtx().state.unallocated;
}

export function useWalletBalance(walletId: string, fallback: WalletBalance): WalletBalance {
  return useLedgerCtx().state.wallets[walletId] ?? fallback;
}

/** Increments each time a token lands on this anchor; key a pulse animation on it. */
export function useLanding(key: string): number {
  return useLedgerCtx().landings[key] ?? 0;
}
