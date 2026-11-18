"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { Check, Store } from "lucide-react";
import { useState } from "react";
import { setRulesAction } from "@/app/business/actions";
import { Button, useSuccessFlash } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { DUR, EASE_OUT } from "@/components/motion-tokens";
import type { Rules, Seller } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { dollarsToMicros } from "@/lib/format";
import { describeRules } from "./describe";
import { AmountInput, parseAmount, useGuarded } from "./forms";

type Errors = Partial<Record<"perPaymentMaxMicros" | "dailyMaxMicros" | "allowedSellerIds" | "form", string>>;

function toPlain(micros: string | null): string {
  if (!micros) return "";
  const v = BigInt(micros);
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${v / 1_000_000n}.${frac.padEnd(2, "0")}` : `${v / 1_000_000n}`;
}

export function RulesForm({ agentId, agentName, rules, sellers }: { agentId: string; agentName: string; rules: Rules; sellers: Seller[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { pending, go } = useGuarded();
  const [ok, flash] = useSuccessFlash(1200);
  const [perPayment, setPerPayment] = useState(toPlain(rules.perPaymentMaxMicros));
  const [daily, setDaily] = useState(toPlain(rules.dailyMaxMicros));
  const [limitSellers, setLimitSellers] = useState(rules.allowedSellerIds !== null);
  const [picked, setPicked] = useState<string[]>(rules.allowedSellerIds ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [attempt, setAttempt] = useState(0);

  // Sellers that are on the allowed list but no longer listed in the directory.
  const unknown = picked.filter((id) => !sellers.some((s) => s.id === id));
  const sellerName = (id: string) => sellers.find((s) => s.id === id)?.name ?? id;

  const draftMicros = (v: string) => (v.trim() ? dollarsToMicros(v) : null);
  const preview = describeRules(
    {
      perPaymentMaxMicros: draftMicros(perPayment) && BigInt(draftMicros(perPayment)!) > 0n ? draftMicros(perPayment) : null,
      dailyMaxMicros: draftMicros(daily) && BigInt(draftMicros(daily)!) > 0n ? draftMicros(daily) : null,
      allowedSellerIds: limitSellers ? picked : null,
    },
    sellerName,
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void go(async () => {
      const next: Errors = {};
      const read = (raw: string, key: "perPaymentMaxMicros" | "dailyMaxMicros") => {
        if (!raw.trim()) return null;
        const p = parseAmount(raw);
        if ("error" in p) {
          next[key] = p.error;
          return null;
        }
        return p.micros;
      };
      const per = read(perPayment, "perPaymentMaxMicros");
      const day = read(daily, "dailyMaxMicros");
      if (limitSellers && picked.length === 0) next.allowedSellerIds = "Pick at least one seller, or allow any seller.";
      if (per && day && BigInt(per) > BigInt(day)) next.perPaymentMaxMicros = "The per-payment limit is higher than the daily limit, so the daily limit would always stop it first.";
      setAttempt((n) => n + 1);
      if (Object.keys(next).length) return setErrors(next);
      const res = await setRulesAction(agentId, { perPaymentMaxMicros: per, dailyMaxMicros: day, allowedSellerIds: limitSellers ? picked : null });
      if (!res.ok) {
        const f = res.field as keyof Errors | undefined;
        return setErrors({ [f && f in { perPaymentMaxMicros: 1, dailyMaxMicros: 1, allowedSellerIds: 1 } ? f : "form"]: res.message });
      }
      setErrors({});
      flash();
      router.refresh();
    });
  }

  return (
    <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-6">
        <Card title="Limits">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Per-payment limit" optional error={errors.perPaymentMaxMicros} errorKey={attempt} helper="The most one payment session can reserve. Empty means no limit.">
              <AmountInput name="perPayment" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} />
            </Field>
            <Field label="Daily limit" optional error={errors.dailyMaxMicros} errorKey={attempt} helper="The most it can spend in one day, counted in UTC. Empty means no limit.">
              <AmountInput name="daily" value={daily} onChange={(e) => setDaily(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Sellers">
          <fieldset>
            <legend className="sr-only">Which sellers {agentName} can pay</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Choice checked={!limitSellers} onSelect={() => setLimitSellers(false)} title="Any seller" body="It can pay any seller that takes Gaitway." />
              <Choice checked={limitSellers} onSelect={() => setLimitSellers(true)} title="Only sellers I pick" body="Payments to anyone else are refused." />
            </div>
          </fieldset>
          <AnimatePresence initial={false}>
            {limitSellers ? (
              <motion.div
                key="pick"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: DUR.standard, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
                className="mt-5"
              >
                <Field label="Allowed sellers" error={errors.allowedSellerIds} errorKey={attempt} helper="From the Gaitway seller directory.">
                  <div className="flex flex-col gap-2" role="group">
                    {sellers.length === 0 ? <p className="text-[15px] text-ink-soft">No sellers are listed in the directory yet.</p> : null}
                    {[...sellers.map((s) => ({ id: s.id, name: s.name, note: s.services.map((x) => x.name).join(", ") })), ...unknown.map((id) => ({ id, name: id, note: "No longer listed" }))].map((s) => {
                      const on = picked.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={cn(
                            "pressable flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pass",
                            on ? "border-pass bg-pass/5" : "border-line-strong bg-card hover-fine:border-ink",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={on}
                            onChange={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                          />
                          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-[5px] border", on ? "border-pass bg-pass text-white" : "border-line-strong bg-card")}>
                            {on ? <Check size={14} strokeWidth={2.5} aria-hidden /> : null}
                          </span>
                          <Store size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-soft" />
                          <span className="min-w-0">
                            <span className="block font-semibold text-ink">{s.name}</span>
                            {s.note ? <span className="block truncate text-sm text-ink-soft">{s.note}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Card tone="ink">
          <p className="eyebrow text-on-ink-soft!">In plain words</p>
          <div className="mt-3 flex flex-col gap-1.5" aria-live="polite">
            {preview.map((l, i) => (
              <p key={i} className={i === 0 ? "text-lg font-medium text-on-ink" : "text-[15px] text-on-ink-soft"}>
                {l.replace(/^Can pay/, `${agentName} can pay`)}
              </p>
            ))}
          </div>
          {errors.form ? (
            <p role="alert" className="mt-4 text-sm font-medium text-stop-bright">
              {errors.form}
            </p>
          ) : null}
          <Button type="submit" block className="mt-6" loading={pending && !ok} success={ok}>
            Save rules
          </Button>
          <p className="mt-3 text-sm text-on-ink-soft">Rules apply to new payment sessions. Sessions already open keep their hold.</p>
        </Card>
      </aside>
    </form>
  );
}

function Choice({ checked, onSelect, title, body }: { checked: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <label
      className={cn(
        "pressable flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pass",
        checked ? "border-pass bg-pass/5" : "border-line-strong bg-card hover-fine:border-ink",
      )}
    >
      <input type="radio" name="sellers" className="sr-only" checked={checked} onChange={onSelect} />
      <span className={cn("mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border", checked ? "border-pass" : "border-line-strong")}>
        {checked ? <span className="size-2 rounded-full bg-pass" /> : null}
      </span>
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-sm text-ink-soft">{body}</span>
      </span>
    </label>
  );
}
