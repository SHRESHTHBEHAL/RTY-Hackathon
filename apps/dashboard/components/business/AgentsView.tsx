"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { CopyButton } from "@/components/CopyOnce";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { Table, type Column } from "@/components/Table";
import type { Agent, Wallet } from "@/lib/api/types";
import { formatDateTime, shortId } from "@/lib/format";
import { NewAgentDialog } from "./NewAgentDialog";

type Row = Agent & { wallet: Wallet | undefined };

export function AgentsView({ agents, wallets, autoOpen }: { agents: Agent[]; wallets: Wallet[]; autoOpen: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [autoOpen, router, pathname]);

  const byWallet = new Map(wallets.map((w) => [w.walletId, w]));
  const rows: Row[] = agents.map((a) => ({ ...a, wallet: byWallet.get(a.walletId) }));

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Agent",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/business/agents/${r.id}`} className="rounded-[4px] font-semibold text-ink hover-fine:text-pass" onClick={(e) => e.stopPropagation()}>
            {r.name}
          </Link>
          <p className="text-sm text-ink-soft">Created {formatDateTime(r.createdAt)}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, hideBelow: "sm" },
    { key: "available", header: "Available", numeric: true, cell: (r) => <Money micros={r.wallet?.availableMicros ?? "0"} variant="mono" rolling /> },
    { key: "held", header: "On hold", numeric: true, hideBelow: "sm", cell: (r) => <Money micros={r.wallet?.heldMicros ?? "0"} variant="mono" rolling /> },
    {
      key: "wallet",
      header: "Wallet ID",
      hideBelow: "md",
      cell: (r) => (
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="font-mono text-[13px] text-ink-soft" title={r.walletId}>
            {shortId(r.walletId, 5)}
          </span>
          <CopyButton value={r.walletId} label={`Copy ${r.name}'s wallet ID`} className="-my-2" />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Agents"
        description="Each agent has its own pass and key, and can spend only what is on its pass."
        action={
          <Button icon={<Plus size={18} strokeWidth={2} aria-hidden />} onClick={() => setOpen(true)}>
            New agent
          </Button>
        }
      />
      <Table
        label="Agents"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/business/agents/${r.id}`)}
        empty={
          <EmptyState
            icon={Bot}
            title="Create your first agent"
            body="An agent gets a pass with its own balance and a key to pay sellers with. You decide how much is on the pass."
            action={
              <Button icon={<Plus size={18} strokeWidth={2} aria-hidden />} onClick={() => setOpen(true)}>
                Create agent
              </Button>
            }
          />
        }
      />
      <NewAgentDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
