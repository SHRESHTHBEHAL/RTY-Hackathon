"use client";

import { KeyRound, Plus, Trash2, Webhook } from "lucide-react";
import { useRef, useState } from "react";
import { Button, ButtonLink, useSuccessFlash } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyButton, CopyOnce } from "@/components/CopyOnce";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { Table, type Column } from "@/components/Table";
import { toast } from "@/components/Toast";
import { createKeyAction, revokeKeyAction } from "@/app/seller/actions";
import { FormError, LocalTime } from "./bits";
import { CodeBlock } from "./CodeBlock";
import { sleep, useGuard } from "./hooks";
import type { ApiKey } from "./result";

function CreateKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (k: ApiKey) => void }) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);
  // The key lives in memory for this dialog only. Closing it drops it.
  const [secret, setSecret] = useState<string | null>(null);
  const { run, pending } = useGuard();
  const [ok, flash] = useSuccessFlash();
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!label.trim()) {
        setError("Give the key a name so you can tell it apart later.");
        setErrKey((k) => k + 1);
        return;
      }
      const r = await createKeyAction(label);
      if (!r.ok) {
        setError(r.message);
        setErrKey((k) => k + 1);
        return;
      }
      flash();
      await sleep(600);
      onCreated(r.data.key);
      setSecret(r.data.apiKey);
    });
  }
  function close() {
    setSecret(null);
    setLabel("");
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissable={!pending && secret === null}
      initialFocus={input}
      title={secret ? "Your new key" : "Create an API key"}
      description={secret ? undefined : "Use it on your server to charge agents. You see it once."}
      footer={
        secret ? (
          <Button onClick={close}>I have saved it</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="key-form" loading={pending} success={ok}>
              Create key
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <CopyOnce value={secret} label="Seller API key" />
      ) : (
        <form id="key-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
          <Field label="Key name" helper="For example “Production server”." error={error} errorKey={errKey}>
            <Input
              ref={input}
              value={label}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => {
                setLabel(e.target.value);
                setError(null);
              }}
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}

function RevokeDialog({ keyRec, onClose, onRevoked }: { keyRec: ApiKey | null; onClose: () => void; onRevoked: (id: string) => void }) {
  const { run, pending } = useGuard();
  const [error, setError] = useState<string | null>(null);
  const last = useRef<ApiKey | null>(null);
  if (keyRec) last.current = keyRec;
  const k = keyRec ?? last.current;
  async function revoke() {
    if (!k) return;
    await run(async () => {
      const r = await revokeKeyAction(k.id);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      onRevoked(k.id);
      toast.success("Key revoked", `${k.label} no longer works.`);
      onClose();
    });
  }
  return (
    <Dialog
      open={keyRec !== null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      dismissable={!pending}
      size="sm"
      title={`Revoke “${k?.label ?? ""}”?`}
      description="Anything still using this key stops working at once. This cannot be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Keep key
          </Button>
          <Button variant="danger" loading={pending} onClick={revoke} icon={<Trash2 size={18} strokeWidth={1.75} />}>
            Revoke key
          </Button>
        </>
      }
    >
      <FormError message={error} />
    </Dialog>
  );
}

export function DevelopersView({ sellerId, keys: initial, snippet }: { sellerId: string; keys: ApiKey[]; snippet: string }) {
  const [keys, setKeys] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const columns: Column<ApiKey>[] = [
    { key: "label", header: "Name", cell: (k) => <span className="font-medium">{k.label}</span> },
    {
      key: "tail",
      header: "Key",
      cell: (k) => <span className="font-mono text-[14px] tabular text-ink-soft">…{k.lastFour}</span>,
    },
    { key: "created", header: "Created", hideBelow: "sm", cell: (k) => <LocalTime iso={k.createdAt} /> },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (k) => (
        <Button variant="ghost" icon={<Trash2 size={18} strokeWidth={1.75} />} onClick={() => setRevoking(k)} aria-label={`Revoke ${k.label}`}>
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <SectionReveal>
      <PageHeader
        eyebrow="Seller"
        title="Developers"
        description="Everything your server needs to charge agents."
        action={
          <ButtonLink href="/seller/developers/webhooks" variant="secondary" icon={<Webhook size={20} strokeWidth={1.75} />}>
            Webhooks
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-6">
        <Card title="Your seller ID" as="section" aria-label="Seller ID">
          <div className="flex flex-wrap items-center gap-x-2">
            <p data-testid="seller-id" className="break-all font-mono text-[17px] text-ink">
              {sellerId}
            </p>
            <CopyButton value={sellerId} label="Copy seller ID" showText />
          </div>
          <p className="mt-1 text-[15px] text-ink-soft">Agents use this to find you. It goes in the snippet below.</p>
        </Card>

        <section aria-labelledby="snippet-h" className="flex flex-col gap-3">
          <h2 id="snippet-h" className="eyebrow">
            Charge your first agent
          </h2>
          <p className="max-w-2xl text-[15px] text-ink-soft">
            Install <code className="rounded bg-ink/6 px-1.5 py-0.5 font-mono text-[13px]">@gaitway/sdk</code>, add your key, and put this in front of any route you want to be paid for.
          </p>
          <CodeBlock code={snippet} label="TypeScript, Express" testId="snippet" />
        </section>

        <section aria-labelledby="keys-h" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="keys-h" className="eyebrow">
              API keys
            </h2>
            <Button icon={<Plus size={20} strokeWidth={1.75} />} onClick={() => setCreating(true)}>
              Create key
            </Button>
          </div>
          <Table
            label="API keys"
            columns={columns}
            rows={keys}
            getRowId={(k) => k.id}
            empty={
              <EmptyState
                icon={KeyRound}
                title="No keys yet"
                body="Create a key to let your server charge agents. You will see it once."
                action={<Button onClick={() => setCreating(true)}>Create your first key</Button>}
              />
            }
          />
        </section>
      </div>

      <CreateKeyDialog open={creating} onClose={() => setCreating(false)} onCreated={(k) => setKeys((l) => [k, ...l])} />
      <RevokeDialog keyRec={revoking} onClose={() => setRevoking(null)} onRevoked={(id) => setKeys((l) => l.filter((k) => k.id !== id))} />
    </SectionReveal>
  );
}
