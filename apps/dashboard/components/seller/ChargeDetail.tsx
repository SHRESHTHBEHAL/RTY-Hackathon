"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/Badge";
import { Button, useSuccessFlash } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyButton } from "@/components/CopyOnce";
import { Dialog } from "@/components/Dialog";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { TicketCard } from "@/components/TicketCard";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { dollarsToMicros, formatUsd, shortId } from "@/lib/format";
import { refundAction } from "@/app/seller/actions";
import { BackLink, FormError, LocalTime } from "./bits";
import { sleep, useGuard } from "./hooks";
import type { Charge } from "./result";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-testid={`row-${label}`} className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <dt className="text-[15px] text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right text-[15px] text-ink">{children}</dd>
    </div>
  );
}

export function ChargeDetail({ charge }: { charge: Charge }) {
  const router = useRouter();
  const total = BigInt(charge.amountMicros);
  const [refunded, setRefunded] = useState(BigInt(charge.refundedMicros));
  useEffect(() => setRefunded(BigInt(charge.refundedMicros)), [charge.refundedMicros]);
  const refundable = total - refunded;

  const [mode, setMode] = useState<"full" | "part">("full");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [errKey, setErrKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const key = useRef("");
  const { run, pending } = useGuard();
  const [ok, flash] = useSuccessFlash();

  const typed = mode === "part" ? dollarsToMicros(text) : null;
  const amount = mode === "full" ? refundable : typed ? BigInt(typed) : 0n;

  let problem: string | null = null;
  if (mode === "part") {
    if (!text.trim()) problem = "Enter the amount to refund.";
    else if (typed === null) problem = "Enter an amount like 0.01, with up to six decimals.";
    else if (amount === 0n) problem = "Enter an amount above $0.00.";
    else if (amount > refundable) problem = `You can refund at most ${formatUsd(refundable)} on this charge.`;
  }
  const shownProblem = touched ? problem : null;

  function review() {
    setTouched(true);
    if (problem) {
      setErrKey((k) => k + 1);
      return;
    }
    key.current = crypto.randomUUID();
    setApiError(null);
    setConfirming(true);
  }

  async function confirm() {
    await run(async () => {
      const r = await refundAction({ chargeId: charge.id, amountMicros: mode === "full" ? undefined : amount.toString(), key: key.current });
      if (!r.ok) {
        setApiError(r.message);
        setErrKey((k) => k + 1);
        return;
      }
      const done = BigInt(r.data.refund.amountMicros);
      setRefunded(r.data.charge ? BigInt(r.data.charge.refundedMicros) : refunded + done);
      setConfirming(false);
      setText("");
      setTouched(false);
      setMode("full");
      flash();
      toast.success(`Refunded ${formatUsd(done)}`, "The money is back in the agent's balance.");
      router.refresh();
    });
  }

  const status = refundable === 0n ? "Fully refunded" : refunded > 0n ? "Partly refunded" : null;

  return (
    <SectionReveal>
      <div>
        <BackLink href="/seller/charges">Charges</BackLink>
        <PageHeader
          eyebrow="Seller"
          title="Charge"
          meta={
            <>
              <span className="inline-flex items-center font-mono text-[14px] text-ink-soft" title={charge.id}>
                {charge.id}
              </span>
              <CopyButton value={charge.id} label="Copy charge ID" className="-my-2" />
            </>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <TicketCard
          as="section"
          aria-label="Charge receipt"
          guilloche
          stub={
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{charge.id}</span>
              {status ? <span className="font-semibold text-ink">{status}</span> : <StatusBadge status="approved" />}
            </>
          }
        >
          <p className="eyebrow">Amount charged</p>
          <div className="mt-4">
            <Money micros={charge.amountMicros} size="xl" />
          </div>
          <dl className="mt-6">
            <Row label="Time">
              <LocalTime iso={charge.createdAt} />
            </Row>
            <Row label="Agent">
              <span className="font-mono text-[14px]" title={charge.agentId}>
                {shortId(charge.agentId, 6)}
              </span>
            </Row>
            <Row label="Fee">
              <Money micros={charge.feeMicros} variant="mono" />
            </Row>
            <Row label="Refunded so far">
              <Money micros={refunded} variant="mono" rolling />
            </Row>
            <Row label="Left to refund">
              <Money micros={refundable} variant="mono" rolling />
            </Row>
            {charge.description ? <Row label="Description">{charge.description}</Row> : null}
            <Row label={charge.mandateId ? "Subscription" : "Payment session"}>
              <span className="font-mono text-[13px]" title={charge.mandateId ?? charge.credentialId ?? ""}>
                {shortId(charge.mandateId ?? charge.credentialId ?? "none", 6)}
              </span>
            </Row>
          </dl>
        </TicketCard>

        <Card title="Refund" as="section" aria-label="Refund this charge" className="self-start">
          {refundable === 0n ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-soft">
                <Undo2 size={16} strokeWidth={1.75} aria-hidden />
              </span>
              <p className="text-[15px] text-ink-soft">
                This charge has been refunded in full. <span className="text-ink">{formatUsd(refunded)}</span> went back to the agent.
              </p>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
              className="flex flex-col gap-4"
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold text-ink">How much</legend>
                {(
                  [
                    ["full", `Refund everything left (${formatUsd(refundable)})`],
                    ["part", "Refund part of it"],
                  ] as const
                ).map(([v, l]) => (
                  <label
                    key={v}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[15px] transition-[border-color,background-color] duration-[var(--dur-quick)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pass",
                      mode === v ? "border-pass bg-pass/6" : "border-line-strong bg-card hover-fine:border-ink",
                    )}
                  >
                    <input
                      type="radio"
                      name="refund-mode"
                      value={v}
                      checked={mode === v}
                      onChange={() => {
                        setMode(v);
                        setTouched(false);
                      }}
                      className="size-4 accent-[var(--pass)]"
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </fieldset>

              {mode === "part" ? (
                <Field label="Amount to refund" helper={`Up to ${formatUsd(refundable)}.`} error={shownProblem} errorKey={errKey}>
                  <Input
                    mono
                    prefix="$"
                    inputMode="decimal"
                    autoComplete="off"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setTouched(true);
                    }}
                    onBlur={() => text && setTouched(true)}
                    placeholder="0.00"
                  />
                </Field>
              ) : null}

              <Button type="submit" success={ok} icon={<Undo2 size={20} strokeWidth={1.75} />} className="self-start">
                Review refund
              </Button>
            </form>
          )}
        </Card>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        dismissable={!pending}
        size="sm"
        title={`Refund ${formatUsd(amount)}?`}
        description={
          <>
            <strong className="font-semibold text-ink">{formatUsd(amount)}</strong> goes back to the agent&apos;s balance. This cannot be undone.
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={confirm}>
              Refund {formatUsd(amount)}
            </Button>
          </>
        }
      >
        <dl className="mb-2">
          <Row label="Charge">
            <span className="font-mono text-[13px]">{shortId(charge.id, 6)}</span>
          </Row>
          <Row label="Left to refund after">
            <Money micros={refundable - amount} variant="mono" />
          </Row>
        </dl>
        <FormError message={apiError} errorKey={errKey} />
      </Dialog>
    </SectionReveal>
  );
}
