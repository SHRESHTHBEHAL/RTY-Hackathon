"use client";

import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Table, type Column } from "@/components/Table";
import type { Transaction } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { TX_TYPE_LABEL, describeTx } from "./describe";

/** Ledger entries as a table: when, what happened in words, the agent, the signed amount. */
export function TxTable({
  rows,
  names,
  showAgent = false,
  label = "Transactions",
  empty,
}: {
  rows: Transaction[];
  names: Record<string, string>;
  showAgent?: boolean;
  label?: string;
  empty?: ReactNode;
}) {
  const columns: Column<Transaction>[] = [
    {
      key: "what",
      header: "What happened",
      cell: (tx) => {
        const w = describeTx(tx, names);
        const Icon = w.icon;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Icon size={18} strokeWidth={1.75} aria-hidden className="hidden shrink-0 text-ink-soft sm:block" />
            <div className="min-w-0">
              <p className="font-medium text-ink">{w.title}</p>
              <p className="text-sm text-ink-soft">
                <time dateTime={tx.createdAt}>{formatDateTime(tx.createdAt)}</time>
                <span className="md:hidden"> · {TX_TYPE_LABEL[tx.type]}</span>
              </p>
            </div>
          </div>
        );
      },
    },
    { key: "type", header: "Type", hideBelow: "md", cell: (tx) => <span className="text-ink-soft">{TX_TYPE_LABEL[tx.type]}</span> },
    ...(showAgent
      ? [
          {
            key: "agent",
            header: "Agent",
            hideBelow: "sm" as const,
            cell: (tx: Transaction) => <span className="text-ink">{(tx.walletId && names[tx.walletId]) || <span className="text-ink-soft">Business</span>}</span>,
          },
        ]
      : []),
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (tx) => (
        <Money micros={tx.amountMicros} variant="mono" signed className={cn(tx.type === "topup" || tx.type === "refund" ? "text-go-text" : "text-ink")} />
      ),
    },
  ];
  return (
    <Table
      label={label}
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      empty={empty ?? <EmptyState icon={Activity} size="compact" title="No transactions yet" body="Money moving in or out shows here." />}
    />
  );
}
