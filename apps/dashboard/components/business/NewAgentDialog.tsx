"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createAgentAction } from "@/app/business/actions";
import { Button } from "@/components/Button";
import { CopyOnce } from "@/components/CopyOnce";
import { Dialog } from "@/components/Dialog";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { useGuarded } from "./forms";

/**
 * Name an agent, then show its API key exactly once. The key lives only in
 * this component's memory; closing the dialog forgets it.
 */
export function NewAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { pending, go } = useGuarded();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [created, setCreated] = useState<{ name: string; id: string; apiKey: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCreated(null);
      setError(null);
    }
  }, [open]);

  function close() {
    setCreated(null);
    onClose();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    void go(async () => {
      const res = await createAgentAction({ name });
      setAttempt((n) => n + 1);
      if (!res.ok) {
        setError(res.message);
        input.current?.focus();
        return;
      }
      setError(null);
      setCreated({ name: res.agent.name, id: res.agent.id, apiKey: res.apiKey });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissable={!pending}
      initialFocus={created ? undefined : input}
      title={created ? `${created.name} is ready` : "New agent"}
      description={
        created
          ? "Give this key to the agent. It uses it to pay sellers from its own pass."
          : "An agent gets its own pass and its own key. It starts with no money; you add some next."
      }
      footer={
        created ? (
          <>
            <Button variant="secondary" onClick={() => router.push(`/business/agents/${created.id}`)}>
              Open {created.name}
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="new-agent" loading={pending}>
              Create agent
            </Button>
          </>
        )
      }
    >
      {created ? (
        <CopyOnce value={created.apiKey} label={`${created.name}'s API key`} />
      ) : (
        <form id="new-agent" noValidate onSubmit={submit}>
          <Field label="Agent name" error={error} errorKey={attempt} helper="A short name you will recognise in activity, like Scout or Buyer.">
            <Input ref={input} name="name" autoComplete="off" maxLength={60} placeholder="Scout" />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
