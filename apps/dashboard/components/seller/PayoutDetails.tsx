"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button, useSuccessFlash } from "@/components/Button";
import { CopyButton } from "@/components/CopyOnce";
import { Dialog } from "@/components/Dialog";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { TicketCard } from "@/components/TicketCard";
import { toast } from "@/components/Toast";
import { setPayoutAddressAction } from "@/app/seller/actions";
import { BackLink, FormError } from "./bits";
import { sleep, useGuard } from "./hooks";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The one screen where the payout address and the USDC it holds are named. */
export function PayoutDetails({ address: initial }: { address: string }) {
  const [address, setAddress] = useState(initial);
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const { run, pending } = useGuard();
  const [ok, flash] = useSuccessFlash();

  function review() {
    const v = next.trim();
    if (!ADDRESS.test(v)) {
      setError("A payout address is 0x followed by 40 letters and digits (0 to 9, a to f).");
      setErrKey((k) => k + 1);
      return;
    }
    if (v.toLowerCase() === address.toLowerCase()) {
      setError("That is already your payout address.");
      setErrKey((k) => k + 1);
      return;
    }
    setError(null);
    setFormError(null);
    setConfirming(true);
  }

  async function confirm() {
    await run(async () => {
      const r = await setPayoutAddressAction(next);
      if (!r.ok) {
        setFormError(r.message);
        setErrKey((k) => k + 1);
        return;
      }
      setAddress(r.data.address);
      setNext("");
      setConfirming(false);
      flash();
      await sleep(0);
      toast.success("Payout address changed", "Your next payout goes to the new address.");
    });
  }

  return (
    <SectionReveal>
      <div>
        <BackLink href="/seller/payouts">Payouts</BackLink>
        <PageHeader
          eyebrow="Seller"
          title="Payout details"
          description="Gaitway sends what agents paid you, in USDC, to this address."
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <TicketCard
          tone="ink"
          guilloche
          as="section"
          aria-label="Payout address"
          stub={<span>USDC only. Check the address before you change it: a payout sent to a wrong address cannot be recovered.</span>}
        >
          <div className="flex items-center gap-2">
            <KeyRound size={16} strokeWidth={1.75} className="text-on-ink-soft" aria-hidden />
            <p className="eyebrow text-on-ink-soft!">Payout address</p>
          </div>
          <p data-testid="payout-address" className="mt-4 break-all font-mono text-[15px] leading-relaxed text-on-ink sm:text-[17px]">
            {address}
          </p>
          <div className="-ml-2.5 mt-3">
            <CopyButton value={address} label="Copy address" showText onInk />
          </div>
        </TicketCard>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
          className="flex flex-col gap-4 self-start rounded-[14px] border border-line bg-card p-6"
        >
          <h2 className="eyebrow">Change payout address</h2>
          <Field label="New payout address" helper="Payouts after the change go here." error={error} errorKey={errKey}>
            <Input
              mono
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setError(null);
              }}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Button type="submit" success={ok} className="self-start">
            Review change
          </Button>
        </form>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        dismissable={!pending}
        title="Send future payouts to this address?"
        description="Payouts already sent stay where they went. This changes only the ones that come next."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} onClick={confirm}>
              Change payout address
            </Button>
          </>
        }
      >
        <p className="break-all rounded-[10px] border border-line bg-paper px-3.5 py-3 font-mono text-[14px]">{next.trim()}</p>
        <div className="mt-3">
          <FormError message={formError} errorKey={errKey} />
        </div>
      </Dialog>
    </SectionReveal>
  );
}
