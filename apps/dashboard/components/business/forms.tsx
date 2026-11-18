"use client";

import { forwardRef, useCallback, useRef, useState, type ReactNode } from "react";
import { Button, useSuccessFlash } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Input, type InputProps } from "@/components/Input";
import { dollarsToMicros } from "@/lib/format";

/**
 * One request per intent: a second click (or Enter) while the first is in
 * flight is dropped here, before React has re-rendered the loading state.
 */
export function useGuarded() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const go = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    try {
      return await fn();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);
  return { pending, go };
}

/** Dollar amount input: "$" prefix, decimal keypad on phones, mono figures. */
export const AmountInput = forwardRef<HTMLInputElement, Omit<InputProps, "prefix">>(function AmountInput(props, ref) {
  return <Input ref={ref} prefix="$" mono inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="0.00" {...props} />;
});

/** Parse the typed amount; returns micros or an error sentence. */
export function parseAmount(raw: string): { micros: string } | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "Enter an amount, like 25 or 12.50." };
  const micros = dollarsToMicros(t);
  if (micros === null) return { error: "Use numbers only, with up to six decimals, like 12.50." };
  if (BigInt(micros) === 0n) return { error: "Enter an amount more than zero." };
  return { micros };
}

export type ConfirmProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Return an error sentence to keep the dialog open and show it. */
  onConfirm: () => Promise<string | null>;
};

/** "Are you sure" for actions that cannot be undone. */
export function ConfirmDialog({ open, onClose, title, body, confirmLabel, tone = "danger", onConfirm }: ConfirmProps) {
  const { pending, go } = useGuarded();
  const [error, setError] = useState<string | null>(null);
  const [ok, flash] = useSuccessFlash(600);
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (pending) return;
        setError(null);
        onClose();
      }}
      dismissable={!pending}
      size="sm"
      title={title}
      description={body}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={tone}
            loading={pending}
            success={ok}
            onClick={() =>
              void go(async () => {
                const err = await onConfirm();
                setError(err);
                if (!err) {
                  flash();
                  setTimeout(onClose, 450);
                }
              })
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm font-medium text-stop-text">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
