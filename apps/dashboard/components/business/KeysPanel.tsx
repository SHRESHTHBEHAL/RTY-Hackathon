"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createAgentKeyAction, createKeyAction, revokeAgentKeyAction, revokeKeyAction } from "@/app/business/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyOnce } from "@/components/CopyOnce";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import type { ApiKey } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog, useGuarded } from "./forms";

export type KeyScope = { type: "agent"; agentId: string; agentName: string } | { type: "business" };

/** A list of API keys with create (shown once) and revoke (confirmed). */
export function KeysPanel({ keys, scope, title = "API keys", description }: { keys: ApiKey[]; scope: KeyScope; title?: string; description?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const known = seen.current;
  useEffect(() => {
    seen.current ??= new Set();
    for (const k of keys) seen.current.add(k.id);
  });

  const who = scope.type === "agent" ? scope.agentName : "your business";
  return (
    <Card
      padding="none"
      title={title}
      actions={
        <Button variant="secondary" icon={<Plus size={18} strokeWidth={2} aria-hidden />} onClick={() => setCreating(true)}>
          Create key
        </Button>
      }
    >
      {description ? <p className="-mt-2 px-6 pb-4 text-[15px] text-ink-soft">{description}</p> : null}
      {keys.length === 0 ? (
        <EmptyState
          size="compact"
          icon={KeyRound}
          title="No keys"
          body={`Without a key nothing can act for ${who}. Create one when you are ready to connect.`}
        />
      ) : (
        <ul className="border-t border-line" aria-label={title}>
          <AnimatePresence initial={false}>
            {keys.map((k) => (
              <motion.li
                key={k.id}
                layout={reduce ? false : "position"}
                initial={known && !known.has(k.id) ? (reduce ? { opacity: 0 } : { opacity: 0, y: -10 }) : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
                transition={{ duration: DUR.standard, ease: EASE_OUT }}
                className="flex items-center gap-3 border-b border-line px-6 py-3 last:border-0"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-soft">
                  <KeyRound size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{k.label}</p>
                  <p className="text-sm text-ink-soft">
                    Ending in <span className="font-mono text-ink">{k.lastFour}</span>
                    <span className="hidden sm:inline"> · created {formatDateTime(k.createdAt)}</span>
                  </p>
                </div>
                <Button variant="ghost" className="text-stop-text" onClick={() => setRevoking(k)} aria-label={`Revoke ${k.label}`}>
                  Revoke
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <CreateKeyDialog open={creating} onClose={() => setCreating(false)} scope={scope} onCreated={() => router.refresh()} />
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={revoking ? `Revoke ${revoking.label}?` : "Revoke key?"}
        body={
          revoking
            ? `Anything using the key ending in ${revoking.lastFour} stops working at once. This cannot be undone.`
            : ""
        }
        confirmLabel="Revoke key"
        onConfirm={async () => {
          if (!revoking) return null;
          const res = scope.type === "agent" ? await revokeAgentKeyAction(scope.agentId, revoking.id) : await revokeKeyAction(revoking.id);
          if (!res.ok) return res.message;
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}

function CreateKeyDialog({ open, onClose, scope, onCreated }: { open: boolean; onClose: () => void; scope: KeyScope; onCreated: () => void }) {
  const { pending, go } = useGuarded();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSecret(null);
      setError(null);
    }
  }, [open]);

  function close() {
    setSecret(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissable={!pending}
      initialFocus={secret ? undefined : input}
      title={secret ? "Copy your new key" : "Create key"}
      description={
        secret
          ? "This is the only time the full key is shown."
          : scope.type === "agent"
            ? `A key lets ${scope.agentName} pay from its pass. Make one per place the agent runs, so you can revoke one without the others.`
            : "A business key can do everything you can do here. Keep it on your servers only."
      }
      footer={
        secret ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="create-key" loading={pending}>
              Create key
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <CopyOnce value={secret.value} label={secret.label} />
      ) : (
        <form
          id="create-key"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const label = String(new FormData(e.currentTarget).get("label") ?? "");
            void go(async () => {
              const res = scope.type === "agent" ? await createAgentKeyAction(scope.agentId, label) : await createKeyAction(label);
              setAttempt((n) => n + 1);
              if (!res.ok) {
                setError(res.message);
                input.current?.focus();
                return;
              }
              setError(null);
              setSecret({ label: res.key.label, value: res.apiKey });
              onCreated();
            });
          }}
        >
          <Field label="Key name" error={error} errorKey={attempt} helper="Where it will be used, like Production or Laptop.">
            <Input ref={input} name="label" autoComplete="off" maxLength={60} placeholder="Production" />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
