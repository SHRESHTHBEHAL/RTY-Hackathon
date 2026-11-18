"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Pause, Play, SlidersHorizontal } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { setAgentStatusAction } from "@/app/business/actions";
import { StatusBadge } from "@/components/Badge";
import { Button, ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyButton } from "@/components/CopyOnce";
import { Money } from "@/components/Money";
import { SPRING_LANDING } from "@/components/motion-tokens";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import type { Agent } from "@/lib/api/types";
import { AllocateDialog, type AllocateDirection } from "./AllocateDialog";
import { ConfirmDialog, useGuarded } from "./forms";
import { useLanding, useLedger } from "./ledger";
import { PassCard } from "./PassCard";

export function AgentHeader({ agent }: { agent: Agent }) {
  const router = useRouter();
  const { pending, go } = useGuarded();
  const [confirming, setConfirming] = useState(false);
  const disabled = agent.status === "disabled";

  async function setStatus(status: Agent["status"]) {
    const res = await setAgentStatusAction(agent.id, status);
    if (!res.ok) return res.message;
    toast.success(status === "disabled" ? `${agent.name} is disabled` : `${agent.name} is active again`);
    router.refresh();
    return null;
  }

  return (
    <>
      <Link href="/business/agents" className="mb-5 inline-flex h-11 items-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-ink-soft hover-fine:text-ink">
        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        All agents
      </Link>
      <PageHeader
        eyebrow="Agent"
        title={agent.name}
        meta={
          <>
            <StatusBadge status={agent.status} />
            <span className="inline-flex items-center gap-0.5 rounded-full border border-line bg-card pl-3 text-sm">
              <span className="text-ink-soft">Wallet</span>
              <span className="ml-1.5 font-mono text-[13px] text-ink" data-testid="wallet-id">
                {agent.walletId}
              </span>
              <CopyButton value={agent.walletId} label="Copy wallet ID" className="h-9 min-w-9" />
            </span>
          </>
        }
        action={
          disabled ? (
            <Button variant="secondary" loading={pending} icon={<Play size={18} strokeWidth={1.75} aria-hidden />} onClick={() => void go(async () => {
              const err = await setStatus("active");
              if (err) toast.error("Could not enable the agent", err);
            })}>
              Enable agent
            </Button>
          ) : (
            <Button variant="secondary" icon={<Pause size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setConfirming(true)}>
              Disable agent
            </Button>
          )
        }
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Disable ${agent.name}?`}
        body="It cannot open new payment sessions until you enable it again. Money stays on its pass, and you can still take it back."
        confirmLabel="Disable agent"
        onConfirm={() => setStatus("disabled")}
      />
    </>
  );
}

/**
 * The agent's pass beside your unallocated balance, with the two money moves
 * between them. The token flies across this gap.
 */
export function AgentMoney({ agent }: { agent: Agent }) {
  const { state } = useLedger();
  const [dir, setDirection] = useState<AllocateDirection>("to_wallet");
  const [open, setOpen] = useState(false);
  const setDir = (d: AllocateDirection) => {
    setDirection(d);
    setOpen(true);
  };
  const wallet = state.wallets[agent.walletId] ?? { available: "0", held: "0" };
  const canTake = BigInt(wallet.available) > 0n;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <PassCard agent={agent} balance={wallet} tone="pass" size="lg" link={false} />
        <div className="flex flex-wrap gap-2">
          <Button icon={<ArrowDownLeft size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setDir("to_wallet")}>
            Add money
          </Button>
          <Button variant="secondary" disabled={!canTake} icon={<ArrowUpRight size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setDir("to_unallocated")}>
            Take money back
          </Button>
        </div>
      </div>
      <UnallocatedCard />
      <AllocateDialog open={open} onClose={() => setOpen(false)} direction={dir} walletId={agent.walletId} agentName={agent.name} />
    </div>
  );
}

function UnallocatedCard() {
  const { state } = useLedger();
  const landing = useLanding("unallocated");
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!landing || reduce) return;
    controls.set({ y: 4 });
    void controls.start({ y: 0, transition: SPRING_LANDING });
  }, [landing, controls, reduce]);

  return (
    <Card className="flex flex-col justify-between gap-6 border-dashed border-line-strong bg-transparent lg:mb-[60px]">
      <div>
        <p className="eyebrow">Unallocated balance</p>
        <motion.div animate={controls} className="mt-3 inline-block" data-ledger="unallocated" data-testid="unallocated-balance">
          <Money micros={state.unallocated} size="lg" rolling />
        </motion.div>
        <p className="mt-3 text-[15px] text-ink-soft">Your money that no agent holds yet. Adding money to this pass takes it from here; taking money back returns it here.</p>
      </div>
      <ButtonLink href="/business/funds" variant="ghost" className="-ml-3 self-start text-pass">
        Top up with test money
      </ButtonLink>
    </Card>
  );
}

export function RulesSummary({ agentId, lines, hasRules }: { agentId: string; lines: string[]; hasRules: boolean }) {
  return (
    <Card
      title="Spending rules"
      actions={
        <ButtonLink href={`/business/agents/${agentId}/rules`} variant="secondary" icon={<SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden />}>
          {hasRules ? "Edit rules" : "Set rules"}
        </ButtonLink>
      }
    >
      <div data-testid="rules-summary" className="flex flex-col gap-1">
        {lines.map((l, i) => (
          <p key={i} className={i === 0 ? "text-lg font-medium text-ink" : "text-[15px] text-ink-soft"}>
            {l}
          </p>
        ))}
      </div>
    </Card>
  );
}
