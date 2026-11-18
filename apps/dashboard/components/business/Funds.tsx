"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, FlaskConical, History } from "lucide-react";
import { useRef, useState } from "react";
import { topupAction, withdrawAction } from "@/app/business/actions";
import { StatusBadge, TestModeBadge } from "@/components/Badge";
import { Button, useSuccessFlash } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { Money } from "@/components/Money";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import { Table, type Column } from "@/components/Table";
import { TicketCard } from "@/components/TicketCard";
import { toast } from "@/components/Toast";
import type { Topup, Withdrawal } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDateTime, formatUsd, shortId } from "@/lib/format";
import { AmountInput, parseAmount, useGuarded } from "./forms";

const QUICK = ["10", "50", "100", "500"];

export function TopupForm() {
  const router = useRouter();
  const { pending, go } = useGuarded();
  const [ok, flash] = useSuccessFlash(1200);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void go(async () => {
      const p = parseAmount(value);
      setAttempt((n) => n + 1);
      if ("error" in p) {
        setError(p.error);
        input.current?.focus();
        return;
      }
      const res = await topupAction(p.micros);
      if (!res.ok) {
        setError(res.message);
        input.current?.focus();
        return;
      }
      setError(null);
      setValue("");
      flash();
      toast(`Top-up of ${formatUsd(res.topup.amountMicros)} started`, { body: "It confirms in a few seconds and lands in your unallocated balance." });
      router.refresh();
    });
  }

  return (
    <TicketCard
      tone="card"
      guilloche
      aria-label="Top up"
      stub={
        <p className="flex items-start gap-2 py-1">
          <FlaskConical size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-hold-text" />
          <span>
            <span className="font-semibold text-ink">Test mode. </span>
            This is test money with no real value. Card and bank top-ups arrive with live mode.
          </span>
        </p>
      }
    >
      <form noValidate onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-ink">Top up</h2>
          <TestModeBadge />
        </div>
        <p className="mt-1.5 text-[15px] text-ink-soft">Adds money to your unallocated balance. From there you give it to agents.</p>
        <div className="mt-5 flex flex-col gap-3">
          <Field label="Amount" error={error} errorKey={attempt}>
            <AmountInput ref={input} name="amount" value={value} onChange={(e) => setValue(e.target.value)} suffix="USD" />
          </Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setValue(q);
                  setError(null);
                }}
                aria-pressed={value === q}
                className={cn(
                  "pressable h-11 min-w-16 cursor-pointer rounded-full border px-4 font-mono text-[14px] tabular",
                  value === q ? "border-pass bg-pass/8 text-pass" : "border-line-strong bg-card text-ink hover-fine:border-ink",
                )}
              >
                ${q}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" size="lg" block className="mt-6" loading={pending && !ok} success={ok} icon={<ArrowDownToLine size={18} strokeWidth={1.75} aria-hidden />}>
          Top up with test money
        </Button>
      </form>
    </TicketCard>
  );
}

export function WithdrawForm({ unallocatedMicros }: { unallocatedMicros: string }) {
  const router = useRouter();
  const { pending, go } = useGuarded();
  const [ok, flash] = useSuccessFlash(1200);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void go(async () => {
      const p = parseAmount(value);
      setAttempt((n) => n + 1);
      if ("error" in p) {
        setError(p.error);
        input.current?.focus();
        return;
      }
      const res = await withdrawAction(p.micros);
      if (!res.ok) {
        setError(res.message);
        input.current?.focus();
        input.current?.select();
        return;
      }
      setError(null);
      setValue("");
      flash();
      toast.success(`Withdrew ${formatUsd(res.withdrawal.amountMicros)}`);
      router.refresh();
    });
  }

  return (
    <TicketCard
      aria-label="Withdraw"
      stub={<p className="py-1">Only unallocated money can be withdrawn. To withdraw money an agent holds, take it back from its pass first.</p>}
    >
      <form noValidate onSubmit={submit}>
        <h2 className="font-display text-2xl text-ink">Withdraw</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">Sends money out of your unallocated balance.</p>
        <div className="mt-5">
          <Field label="Amount" error={error} errorKey={attempt} helper={`Up to ${formatUsd(unallocatedMicros)} unallocated.`}>
            <AmountInput ref={input} name="amount" value={value} onChange={(e) => setValue(e.target.value)} suffix="USD" />
          </Field>
        </div>
        <Button type="submit" size="lg" block className="mt-6" loading={pending && !ok} success={ok} icon={<ArrowUpFromLine size={18} strokeWidth={1.75} aria-hidden />}>
          Withdraw
        </Button>
      </form>
    </TicketCard>
  );
}

/** A status badge that cross-fades when the status changes (pending -> confirmed). */
function LiveStatus({ status }: { status: Topup["status"] | Withdrawal["status"] }) {
  return (
    <span className="relative inline-grid" aria-live="polite">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={status}
          className="[grid-area:1/1]"
          initial={{ opacity: 0, scale: 0.96, filter: "blur(2px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: DUR.standard, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
        >
          <StatusBadge status={status} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function TopupsTable({ rows }: { rows: Topup[] }) {
  const columns: Column<Topup>[] = [
    {
      key: "amount",
      header: "Amount",
      cell: (t) => (
        <div>
          <Money micros={t.amountMicros} variant="mono" className="text-[15px] text-ink" />
          <p className="text-sm text-ink-soft">{t.method === "test" ? "Test money" : "Card or bank"}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (t) => <LiveStatus status={t.status} /> },
    { key: "when", header: "Started", hideBelow: "sm", cell: (t) => <span className="text-ink-soft">{formatDateTime(t.createdAt)}</span> },
    { key: "id", header: "Reference", hideBelow: "md", cell: (t) => <span className="font-mono text-[13px] text-ink-soft" title={t.id}>{shortId(t.id, 5)}</span> },
  ];
  return (
    <Table
      label="Top-ups"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      empty={<EmptyState icon={History} size="compact" title="No top-ups yet" body="Top up with test money to give your agents something to spend." />}
    />
  );
}

export function WithdrawalsTable({ rows }: { rows: Withdrawal[] }) {
  const columns: Column<Withdrawal>[] = [
    { key: "amount", header: "Amount", cell: (w) => <Money micros={w.amountMicros} variant="mono" className="text-[15px] text-ink" /> },
    { key: "status", header: "Status", cell: (w) => <LiveStatus status={w.status} /> },
    { key: "when", header: "Requested", hideBelow: "sm", cell: (w) => <span className="text-ink-soft">{formatDateTime(w.createdAt)}</span> },
    { key: "id", header: "Reference", hideBelow: "md", cell: (w) => <span className="font-mono text-[13px] text-ink-soft" title={w.id}>{shortId(w.id, 5)}</span> },
  ];
  return (
    <Table
      label="Withdrawals"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      empty={<EmptyState icon={History} size="compact" title="No withdrawals yet" body="Withdrawals you make show here with their status." />}
    />
  );
}
