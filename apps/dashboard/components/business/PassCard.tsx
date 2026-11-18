"use client";

import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ArrowRight, Lock, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/Badge";
import { CopyButton } from "@/components/CopyOnce";
import { Money } from "@/components/Money";
import { SPRING_LANDING } from "@/components/motion-tokens";
import { TicketCard, type TicketTone } from "@/components/TicketCard";
import type { Agent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { shortId } from "@/lib/format";
import { AllocateDialog } from "./AllocateDialog";
import { useLanding, useWalletBalance, type WalletBalance } from "./ledger";

export type PassAgent = Pick<Agent, "id" | "name" | "walletId" | "status">;

/**
 * An agent's wallet drawn as a pass: name and balances on the body, an
 * engraved rosette behind them, the wallet ID on the perforated stub. When
 * a token lands on it the pass gives a small physical settle.
 */
export function PassCard({
  agent,
  balance,
  tone = "card",
  size = "md",
  quickAdd = false,
  link = true,
  className,
}: {
  agent: PassAgent;
  balance: WalletBalance;
  tone?: TicketTone;
  size?: "md" | "lg";
  quickAdd?: boolean;
  link?: boolean;
  className?: string;
}) {
  const live = useWalletBalance(agent.walletId, balance);
  const landing = useLanding(agent.walletId);
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const first = useRef(true);
  const [adding, setAdding] = useState(false);
  const disabled = agent.status === "disabled";
  const soft = tone === "card" ? "text-ink-soft" : tone === "ink" ? "text-on-ink-soft" : "text-white/75";

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (landing === 0) return;
    // The pass drops a few pixels as the token lands, then springs back.
    if (reduce) {
      controls.set({ opacity: 0.7 });
      void controls.start({ opacity: 1, transition: { duration: 0.2 } });
    } else {
      controls.set({ y: 5, scale: 0.985 });
      void controls.start({ y: 0, scale: 1, transition: SPRING_LANDING });
    }
  }, [landing, controls, reduce]);

  return (
    <motion.div animate={controls} className={cn("h-full", className)}>
      <TicketCard
        as="article"
        tone={tone}
        guilloche
        className={cn("h-full", disabled && "opacity-70")}
        bodyClassName={size === "lg" ? "p-6 pb-5 sm:p-8 sm:pb-6" : undefined}
        aria-label={`${agent.name} pass`}
        stub={
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <span className={cn("eyebrow shrink-0", tone !== "card" && "text-current! opacity-80")}>Wallet</span>
              <span className="truncate font-mono text-[13px]" title={agent.walletId}>
                {shortId(agent.walletId, 6)}
              </span>
              <CopyButton value={agent.walletId} label={`Copy ${agent.name}'s wallet ID`} onInk={tone !== "card"} className="-my-2" />
            </div>
            {quickAdd && !disabled ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={cn(
                  "pressable -my-2 -mr-2 inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold",
                  tone === "card" ? "text-pass hover-fine:bg-pass/8" : "text-white hover-fine:bg-white/10",
                )}
              >
                <Plus size={16} strokeWidth={2} aria-hidden />
                Add money
              </button>
            ) : null}
          </div>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <p className={cn("eyebrow", tone !== "card" && "text-current! opacity-80")}>Agent pass</p>
          {disabled ? <StatusBadge status="disabled" onInk={tone !== "card"} /> : null}
        </div>
        {link ? (
          <Link
            href={`/business/agents/${agent.id}`}
            className="group/name mt-2 inline-flex max-w-full items-center gap-2 rounded-[6px]"
          >
            <h3 className={cn("truncate font-display", size === "lg" ? "text-[40px] sm:text-3xl" : "text-2xl")}>{agent.name}</h3>
            <ArrowRight
              size={20}
              strokeWidth={1.75}
              aria-hidden
              className="shrink-0 opacity-40 transition-[opacity,transform] duration-[var(--dur-quick)] group-hover-fine/name:translate-x-0.5 group-hover-fine/name:opacity-100"
            />
          </Link>
        ) : (
          <h2 className={cn("mt-2 truncate font-display", size === "lg" ? "text-[40px] sm:text-3xl" : "text-2xl")}>{agent.name}</h2>
        )}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.08em]", soft)}>Available</p>
            <div className="mt-1.5" data-ledger={agent.walletId} data-testid={`pass-available-${agent.name}`}>
              <Money micros={live.available} size={size === "lg" ? "xl" : "lg"} rolling />
            </div>
          </div>
          <div className="pb-1 text-right">
            <p className={cn("inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em]", soft)}>
              <Lock size={12} strokeWidth={2} aria-hidden />
              On hold
            </p>
            <div className="mt-1 text-[15px]" data-testid={`pass-held-${agent.name}`}>
              <Money micros={live.held} variant="mono" rolling />
            </div>
          </div>
        </div>
      </TicketCard>
      {quickAdd ? (
        <AllocateDialog open={adding} onClose={() => setAdding(false)} direction="to_wallet" walletId={agent.walletId} agentName={agent.name} />
      ) : null}
    </motion.div>
  );
}
