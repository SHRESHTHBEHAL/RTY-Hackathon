"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Input } from "@/components/Input";
import { loginAction, type AuthField } from "../actions";
import { AuthTicket, FormBanner } from "../AuthTicket";

export function LoginForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Partial<Record<AuthField, string>>>({});
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || done) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await loginAction({ email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") });
      setAttempt((n) => n + 1);
      if (res.ok) {
        setErrors({});
        setDone(true);
        router.push(res.kind === "business" ? "/business" : "/seller");
      } else {
        setErrors({ [res.field]: res.message });
        (res.field === "email" ? email : password).current?.focus();
        if (res.field === "password") password.current?.select();
      }
    });
  }

  return (
    <AuthTicket
      eyebrow="Log in"
      title="Welcome back"
      stub={
        <p className="text-ink-soft">
          New to Gaitway?{" "}
          <Link href="/signup" className="rounded-[4px] font-semibold text-pass underline-offset-4 hover-fine:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {errors.form ? <FormBanner message={errors.form} /> : null}
        <Field label="Email" error={errors.email} errorKey={attempt}>
          <Input ref={email} name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" />
        </Field>
        <Field label="Password" error={errors.password} errorKey={attempt}>
          <Input ref={password} name="password" type="password" revealable autoComplete="current-password" />
        </Field>
        <Button type="submit" size="lg" block loading={pending || done} className="mt-1">
          Log in
        </Button>
      </form>
    </AuthTicket>
  );
}
