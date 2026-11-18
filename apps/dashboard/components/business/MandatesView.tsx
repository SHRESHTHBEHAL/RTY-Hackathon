"use client";

import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { useState } from "react";
import { revokeMandateAction } from "@/app/business/actions";
import { StatusBadge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Table, type Column } from "@/components/Table";
import { toast } from "@/components/Toast";
import type { Mandate } from "@/lib/api/types";
import { formatDateTime, formatUsd } from "@/lib/format";
import { PERIOD_WORD } from "./describe";
import { ConfirmDialog } from "./forms";

export type MandateRow = Mandate & { agentName: string; sellerName: string };

/** Standing permissions an agent gave a seller to charge it each period. */
export function MandatesView({ rows }: { rows: MandateRow[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<MandateRow | null>(null);

  const columns: Column<MandateRow>[] = [
    {
      key: "who",
      header: "Subscription",
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {m.agentName} <span className="font-normal text-ink-soft">pays</span> {m.sellerName}
          </p>
          <p className="text-sm text-ink-soft">Since {formatDateTime(m.createdAt)}</p>
          <p className="mt-0.5 text-sm text-ink sm:hidden">
            Up to <Money micros={m.maxPerPeriodMicros} variant="mono" /> {PERIOD_WORD[m.period]}
            {m.status === "revoked" ? <span className="text-ink-soft"> · Revoked</span> : null}
          </p>
        </div>
      ),
    },
    {
      key: "limit",
      header: "Limit",
      align: "right",
      hideBelow: "sm",
      cell: (m) => (
        <span className="whitespace-nowrap">
          <Money micros={m.maxPerPeriodMicros} variant="mono" className="text-ink" /> <span className="text-sm text-ink-soft">{PERIOD_WORD[m.period]}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", hideBelow: "sm", cell: (m) => <StatusBadge status={m.status} /> },
    {
      key: "action",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      className: "relative",
      cell: (m) =>
        m.status === "active" ? (
          <Button variant="ghost" className="text-stop-text" onClick={() => setRevoking(m)} aria-label={`Revoke ${m.agentName}'s subscription to ${m.sellerName}`}>
            Revoke
          </Button>
        ) : (
          <span className="sr-only sm:hidden">Revoked</span>
        ),
    },
  ];

  return (
    <>
      <Table
        label="Subscriptions"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        empty={
          <EmptyState
            icon={Repeat}
            title="No subscriptions"
            body="When an agent lets a seller charge it on a schedule, the subscription shows here and you can revoke it at any time."
          />
        }
      />
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="Revoke this subscription?"
        body={
          revoking
            ? `${revoking.sellerName} can no longer charge ${revoking.agentName} up to ${formatUsd(revoking.maxPerPeriodMicros)} ${PERIOD_WORD[revoking.period]}. This cannot be undone; the agent would have to subscribe again.`
            : ""
        }
        confirmLabel="Revoke subscription"
        onConfirm={async () => {
          if (!revoking) return null;
          const res = await revokeMandateAction(revoking.id);
          if (!res.ok) return res.message;
          toast.success("Subscription revoked");
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
