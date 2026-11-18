"use client";

import { Repeat } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { Table, type Column } from "@/components/Table";
import { formatUsd, shortId } from "@/lib/format";
import { LocalTime } from "./bits";

export type Subscriber = { mandateId: string; agentId: string; charges: number; totalMicros: string; lastAt: string };

export function Subscribers({ subscribers }: { subscribers: Subscriber[] }) {
  const columns: Column<Subscriber>[] = [
    {
      key: "agent",
      header: "Agent",
      cell: (s) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[14px] tabular" title={s.agentId}>
            {shortId(s.agentId)}
          </span>
          <span className="font-mono text-xs text-ink-soft md:hidden" title={s.mandateId}>
            {shortId(s.mandateId)}
          </span>
        </div>
      ),
    },
    {
      key: "mandate",
      header: "Subscription",
      hideBelow: "md",
      cell: (s) => (
        <span className="font-mono text-[13px]" title={s.mandateId}>
          {s.mandateId}
        </span>
      ),
    },
    { key: "charges", header: "Charges", numeric: true, cell: (s) => <span>{s.charges}</span> },
    { key: "total", header: "Total charged", numeric: true, cell: (s) => <Money micros={s.totalMicros} variant="mono" /> },
    { key: "last", header: "Last charged", hideBelow: "sm", cell: (s) => <LocalTime iso={s.lastAt} /> },
  ];
  const total = subscribers.reduce((n, s) => n + BigInt(s.totalMicros), 0n);
  return (
    <SectionReveal>
      <PageHeader
        eyebrow="Seller"
        title="Subscriptions"
        description="Agents that let you charge them again and again, up to a limit they set. Listed from the charges you have made against each one."
        meta={subscribers.length > 0 ? <span className="text-sm text-ink-soft">{subscribers.length} subscribed, {formatUsd(total)} charged in all</span> : undefined}
      />
      <Table
        label="Subscribers"
        columns={columns}
        rows={subscribers}
        getRowId={(s) => s.mandateId}
        empty={
          <EmptyState
            icon={Repeat}
            title="No subscribers yet"
            body="When an agent gives you a subscription and you charge against it, it is listed here."
          />
        }
      />
    </SectionReveal>
  );
}
