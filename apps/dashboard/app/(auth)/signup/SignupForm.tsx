"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { CopyOnce } from "@/components/CopyOnce";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { DUR, EASE_OUT, SPRING_LANDING, exitOf } from "@/components/motion-tokens";
import { signupAction, type AuthField } from "../actions";
import { AuthTicket, FormBanner } from "../AuthTicket";
import { KindSwitch, type Kind } from "../KindSwitch";

type Errors = Partial<Record<AuthField, string>>;

export function SignupForm({ initialKind }: { initialKind: Kind }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [errors, setErrors] = useState<Errors>({});
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ kind: Kind; name: string; apiKey: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const input = { kind, name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") };
    startTransition(async () => {
      const res = await signupAction(input);
      setAttempt((n) => n + 1);
      if (res.ok) {
        setErrors({});
        setIssued({ kind: res.kind, name: res.name, apiKey: res.apiKey });
      } else {
        setErrors({ [res.field]: res.message });
        const r = refs[res.field as keyof typeof refs];
        r?.current?.focus();
      }
    });
  }

  const swap = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
    exit: { opacity: 0, transition: { duration: exitOf(DUR.slow) } },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {issued ? (
        <motion.div key="issued" {...swap}>
          <AuthTicket
            eyebrow={issued.kind === "business" ? "Business account" : "Seller account"}
            title={
              <span className="relative inline-block">
                You are in
                <motion.span
                  aria-hidden
                  className="absolute -right-24 -top-3 hidden rotate-[-9deg] rounded-[6px] border-2 border-go-text px-2 py-0.5 text-[18px] tracking-[0.08em] text-go-text sm:block"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.5 }}
                  animate={{ opacity: 1, scale: 1, transition: reduce ? { duration: 0.2 } : { ...SPRING_LANDING, delay: 0.25 } }}
                >
                  Issued
                </motion.span>
              </span>
            }
            stub={
              <Button
                block
                size="lg"
                loading={leaving}
                iconAfter={<ArrowRight size={18} strokeWidth={2} aria-hidden />}
                onClick={() => {
                  setLeaving(true);
                  router.push(issued.kind === "business" ? "/business" : "/seller");
                }}
              >
                Continue to dashboard
              </Button>
            }
          >
            <p className="text-[16px] text-ink-soft">
              {issued.name} is set up in test mode. Here is your {issued.kind} API key, for your server code.
            </p>
            <CopyOnce className="mt-5" value={issued.apiKey} label={issued.kind === "business" ? "Business API key" : "Seller API key"} />
          </AuthTicket>
        </motion.div>
      ) : (
        <motion.div key="form" {...swap}>
          <AuthTicket
            eyebrow="Sign up"
            title="Create your account"
            stub={
              <p className="text-ink-soft">
                Already have an account?{" "}
                <Link href="/login" className="rounded-[4px] font-semibold text-pass underline-offset-4 hover-fine:underline">
                  Log in
                </Link>
              </p>
            }
          >
            <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
              <KindSwitch
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setErrors((er) => ({ ...er, form: undefined }));
                }}
              />
              {errors.form ? <FormBanner message={errors.form} /> : null}
              <Field label={kind === "business" ? "Business name" : "Seller name"} error={errors.name} errorKey={attempt}>
                <Input ref={refs.name} name="name" autoComplete="organization" placeholder={kind === "business" ? "Acme Ops" : "Relay"} maxLength={80} />
              </Field>
              <Field label="Work email" error={errors.email} errorKey={attempt}>
                <Input ref={refs.email} name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" />
              </Field>
              <Field label="Password" helper={errors.password ? undefined : "At least 8 characters."} error={errors.password} errorKey={attempt}>
                <Input ref={refs.password} name="password" type="password" revealable autoComplete="new-password" />
              </Field>
              <Button type="submit" size="lg" block loading={pending} className="mt-1">
                {kind === "business" ? "Create business account" : "Create seller account"}
              </Button>
            </form>
          </AuthTicket>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
