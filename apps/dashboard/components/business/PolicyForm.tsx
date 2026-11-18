"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { deletePolicyHookAction, setPolicyHookAction } from "@/app/business/actions";
import { Button, useSuccessFlash } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyOnce } from "@/components/CopyOnce";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { ConfirmDialog, useGuarded } from "./forms";

export function PolicyForm({ url }: { url: string | null }) {
  const router = useRouter();
  const { pending, go } = useGuarded();
  const [ok, flash] = useSuccessFlash(1200);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void go(async () => {
      const res = await setPolicyHookAction(value);
      setAttempt((n) => n + 1);
      if (!res.ok) {
        setError(res.message);
        input.current?.focus();
        return;
      }
      setError(null);
      setSecret(res.secret);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Hook address" actions={url ? <span className="text-sm font-semibold text-go-text">On</span> : <span className="text-sm text-ink-soft">Off</span>}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <Field
            label="URL"
            error={error}
            errorKey={attempt}
            helper={url ? "Saving a new address also makes a new secret. Update your server with it." : "Gaitway sends a signed POST to this address."}
          >
            <Input ref={input} name="url" type="url" inputMode="url" mono autoComplete="off" spellCheck={false} placeholder="https://example.com/gaitway/policy" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {url ? (
              <Button variant="ghost" className="text-stop-text" icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setRemoving(true)}>
                Turn off hook
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={pending && !ok} success={ok}>
              Save hook
            </Button>
          </div>
        </form>
      </Card>
      {secret ? (
        <CopyOnce
          value={secret}
          label="Policy hook secret"
          warning="Your server uses it to check the gaitway-signature header on every call. Copy it now: it is shown only this once."
        />
      ) : null}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Turn off the policy hook?"
        body="Gaitway stops asking your server before payments. Your agents' spending rules still apply."
        confirmLabel="Turn off hook"
        onConfirm={async () => {
          const res = await deletePolicyHookAction();
          if (!res.ok) return res.message;
          setSecret(null);
          setValue("");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
