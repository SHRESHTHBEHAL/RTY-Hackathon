"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { allocateAction } from "@/app/business/actions";
import { Button, useSuccessFlash } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field } from "@/components/Field";
import { formatUsd } from "@/lib/format";
import { AmountInput, parseAmount, useGuarded } from "./forms";
import { useLedger } from "./ledger";

export type AllocateDirection = "to_wallet" | "to_unallocated";

/**
 * "Add money" moves money from the unallocated balance onto an agent's pass;
 * "Take money back" moves available money off the pass. On success the
 * dialog closes and the ledger plays the move: a token travels between the
 * two balances and each one rolls.
 */
export function AllocateDialog({
  open,
  onClose,
  direction,
  walletId,
  agentName,
}: {
  open: boolean;
  onClose: () => void;
  direction: AllocateDirection;
  walletId: string;
  agentName: string;
}) {
  const ledger = useLedger();
  const { pending, go } = useGuarded();
  const [ok, flash] = useSuccessFlash(1200);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const source = direction === "to_wallet" ? ledger.state.unallocated : (ledger.state.wallets[walletId]?.available ?? "0");
  const add = direction === "to_wallet";

  useEffect(() => {
    if (open) {
      setValue("");
      setError(null);
    }
  }, [open]);

  function fail(msg: string) {
    setError(msg);
    setAttempt((n) => n + 1);
    input.current?.focus();
    input.current?.select();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void go(async () => {
      const parsed = parseAmount(value);
      if ("error" in parsed) return fail(parsed.error);
      const res = await allocateAction({ walletId, amountMicros: parsed.micros, direction });
      if (!res.ok) return fail(res.message);
      setError(null);
      flash();
      // Close first so the token flies over the page, not the dialog.
      await new Promise((r) => setTimeout(r, 380));
      onClose();
      ledger.move(direction, res);
    });
  }

  const formId = `alloc-${walletId}-${direction}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={!pending}
      initialFocus={input}
      title={add ? `Add money to ${agentName}` : `Take money back from ${agentName}`}
      description={
        add
          ? "Moves money from your unallocated balance onto this agent's pass. The agent can spend it straight away."
          : "Moves money the agent has not spent or put on hold back to your unallocated balance."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={pending && !ok}
            success={ok}
            icon={add ? <ArrowDownLeft size={18} strokeWidth={1.75} aria-hidden /> : <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden />}
          >
            {add ? "Add money" : "Take money back"}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Amount"
          error={error}
          errorKey={attempt}
          helper={add ? `Unallocated balance: ${formatUsd(source)}` : `Available on this pass: ${formatUsd(source)}`}
          aside={
            BigInt(source) > 0n ? (
              <button
                type="button"
                onClick={() => {
                  setValue(plainDollars(source));
                  input.current?.focus();
                }}
                className="cursor-pointer rounded-[6px] font-semibold text-pass underline-offset-4 hover-fine:underline"
              >
                Use all {formatUsd(source)}
              </button>
            ) : null
          }
        >
          <AmountInput ref={input} name="amount" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Exact dollars for an input, no rounding: "49995000" -> "49.995". */
function plainDollars(micros: string): string {
  const v = BigInt(micros);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac.length < 2 ? frac.padEnd(2, "0") : frac}` : `${whole}`;
}
