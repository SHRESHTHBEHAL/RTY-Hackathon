"use client";

import { useState } from "react";
import { Button, useSuccessFlash } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyOnce } from "@/components/CopyOnce";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { toast } from "@/components/Toast";
import { setWebhookAction } from "@/app/seller/actions";
import { BackLink, FormError } from "./bits";
import { sleep, useGuard } from "./hooks";

const EVENTS = [
  ["charge.refunded", "A charge was refunded."],
  ["payout.sent", "A payout was sent to you."],
  ["mandate.revoked", "A subscription was revoked."],
] as const;

export function WebhookForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);
  // Held in memory only. A reload drops it.
  const [saved, setSaved] = useState<{ url: string; secret: string } | null>(null);
  const { run, pending } = useGuard();
  const [ok, flash] = useSuccessFlash();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const r = await setWebhookAction(url);
      if (!r.ok) {
        if (r.field === "url") setError(r.message);
        else setFormError(r.message);
        setErrKey((k) => k + 1);
        return;
      }
      setError(null);
      setFormError(null);
      flash();
      await sleep(500);
      setSaved(r.data);
      setUrl("");
      toast.success("Webhook saved", r.data.url);
    });
  }

  return (
    <SectionReveal>
      <div>
        <BackLink href="/seller/developers">Developers</BackLink>
        <PageHeader eyebrow="Seller" title="Webhooks" description="Gaitway calls your server when something happens to your money, so you do not have to keep checking." />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-[14px] border border-line bg-card p-6">
            <h2 className="eyebrow">Webhook address</h2>
            <Field
              label="Address Gaitway should call"
              helper="Saving replaces the old address and makes a new secret. Gaitway does not show the saved address again."
              error={error}
              errorKey={errKey}
            >
              <Input
                mono
                inputMode="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <FormError message={formError} errorKey={errKey} />
            <Button type="submit" loading={pending} success={ok} className="self-start">
              Save webhook
            </Button>
          </form>
          {saved ? (
            <CopyOnce
              value={saved.secret}
              label="Webhook secret"
              warning={`Use it to check that calls to ${saved.url} come from Gaitway. It cannot be shown again, so copy it now.`}
            />
          ) : null}
        </div>

        <Card title="What Gaitway sends" as="section" className="self-start">
          <p className="text-[15px] text-ink-soft">
            A POST with a JSON body and a <code className="font-mono text-[13px] text-ink">gaitway-signature</code> header: the hex HMAC-SHA256 of the raw body, made with your secret.
          </p>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {EVENTS.map(([name, what]) => (
              <li key={name} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <code className="font-mono text-[14px] text-ink">{name}</code>
                <span className="text-sm text-ink-soft">{what}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </SectionReveal>
  );
}
