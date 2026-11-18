"use client";

import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { Table, type Column } from "@/components/Table";
import { toast } from "@/components/Toast";
import { shortId } from "@/lib/format";
import { listChargesAction } from "@/app/seller/actions";
import { LocalTime } from "./bits";
import { useGuard } from "./hooks";
import type { Charge } from "./result";

export function ChargesView({ initial, nextCursor }: { initial: Charge[]; nextCursor: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const { run, pending } = useGuard();

  async function more() {
    await run(async () => {
      const r = await listChargesAction(cursor ?? undefined);
      if (!r.ok) {
        toast.error("Could not load more charges", r.message);
        return;
      }
      setRows((cur) => [...cur, ...r.data.data.filter((c) => !cur.some((x) => x.id === c.id))]);
      setCursor(r.data.nextCursor);
    });
  }

  const columns: Column<Charge>[] = [
    {
      key: "time",
      header: "Time",
      cell: (c) => (
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/seller/charges/${c.id}`}
            className="font-medium text-ink underline-offset-4 hover-fine:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <LocalTime iso={c.createdAt} />
          </Link>
          <span className="font-mono text-xs text-ink-soft sm:hidden" title={c.agentId}>
            {shortId(c.agentId)}
          </span>
        </div>
      ),
    },
    {
      key: "agent",
      header: "Agent",
      hideBelow: "sm",
      cell: (c) => (
        <span className="font-mono text-[14px] tabular" title={c.agentId}>
          {shortId(c.agentId)}
        </span>
      ),
    },
    { key: "amount", header: "Amount", numeric: true, cell: (c) => <Money micros={c.amountMicros} variant="mono" /> },
    { key: "fee", header: "Fee", numeric: true, hideBelow: "sm", cell: (c) => <Money micros={c.feeMicros} variant="mono" /> },
    {
      key: "refunded",
      header: "Refunded",
      numeric: true,
      hideBelow: "md",
      cell: (c) => (c.refundedMicros === "0" ? <span className="text-ink-soft">None</span> : <Money micros={c.refundedMicros} variant="mono" />),
    },
  ];

  return (
    <SectionReveal>
      <PageHeader eyebrow="Seller" title="Charges" description="Every payment an agent has made to you. Open one to refund it." />
      <div>
        <Table
          label="Charges"
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          onRowClick={(c) => router.push(`/seller/charges/${c.id}`)}
          empty={
            <EmptyState
              icon={ReceiptText}
              title="No charges yet"
              body="When an agent pays one of your services, the charge shows up here with its fee."
              action={
                <ButtonLink href="/seller/developers" variant="secondary">
                  See how to integrate
                </ButtonLink>
              }
            />
          }
        />
        {cursor ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" loading={pending} onClick={more}>
              Show more charges
            </Button>
          </div>
        ) : null}
      </div>
    </SectionReveal>
  );
}
