"use client";

import { Banknote, Settings2 } from "lucide-react";
import { StatusBadge } from "@/components/Badge";
import { ButtonLink } from "@/components/Button";
import { CopyButton } from "@/components/CopyOnce";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { Table, type Column } from "@/components/Table";
import { LocalTime, shortRef } from "./bits";
import type { Payout } from "./result";

function Ref({ payout }: { payout: Payout }) {
  if (!payout.txHash) return <span className="text-ink-soft">Not sent yet</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[13px] tabular" title={payout.txHash}>
        {shortRef(payout.txHash)}
      </span>
      <CopyButton value={payout.txHash} label="Copy transaction reference" className="-my-2" />
    </span>
  );
}

export function PayoutsView({ payouts }: { payouts: Payout[] }) {
  const columns: Column<Payout>[] = [
    {
      key: "date",
      header: "Date",
      cell: (p) => (
        <div className="flex flex-col gap-0.5">
          <LocalTime iso={p.createdAt} className="font-medium" />
          <span className="font-mono text-xs text-ink-soft sm:hidden" title={p.txHash ?? undefined}>
            {p.txHash ? shortRef(p.txHash, 4) : "Not sent yet"}
          </span>
        </div>
      ),
    },
    { key: "amount", header: "Amount", numeric: true, cell: (p) => <Money micros={p.amountMicros} variant="mono" /> },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "ref", header: "Transaction reference", hideBelow: "sm", cell: (p) => <Ref payout={p} /> },
  ];
  return (
    <SectionReveal>
      <PageHeader
        eyebrow="Seller"
        title="Payouts"
        description="Money Gaitway has sent to you from what agents paid."
        action={
          <ButtonLink href="/seller/payouts/details" variant="secondary" icon={<Settings2 size={20} strokeWidth={1.75} />}>
            Payout details
          </ButtonLink>
        }
      />
      <Table
        label="Payouts"
        columns={columns}
        rows={payouts}
        getRowId={(p) => p.id}
        empty={
          <EmptyState
            icon={Banknote}
            title="No payouts yet"
            body="Once agents have paid you, Gaitway sends the money out in batches. Each payout shows up here with its reference."
          />
        }
      />
    </SectionReveal>
  );
}
