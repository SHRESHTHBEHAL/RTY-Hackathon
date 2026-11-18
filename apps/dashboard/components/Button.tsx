"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the punch indicator, blocks clicks, keeps width. */
  loading?: boolean;
  /** Shows a check in place of the label (pair with useSuccessFlash). */
  success?: boolean;
  /** Icon before the label (a lucide icon element). */
  icon?: ReactNode;
  /** Icon after the label. */
  iconAfter?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  /** Ink surfaces need different secondary and ghost colours. */
  onInk?: boolean;
  className?: string;
  children?: ReactNode;
};

export type ButtonProps = Common & Omit<ComponentProps<"button">, keyof Common>;
export type ButtonLinkProps = Common & Omit<ComponentProps<typeof Link>, keyof Common>;

const base =
  "pressable relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-sans font-semibold " +
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed cursor-pointer";

const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-[15px]",
  lg: "h-13 px-6 text-base",
};

function variantClass(v: ButtonVariant, onInk: boolean, inert: boolean): string {
  switch (v) {
    case "primary":
      return cn(
        "bg-pass text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.14)]",
        !inert && "hover-fine:bg-pass-hover",
        inert && "opacity-60",
      );
    case "danger":
      return cn("bg-stop-text text-white", !inert && "hover-fine:bg-stop-text/90", inert && "opacity-60");
    case "secondary":
      return onInk
        ? cn("border border-ink-line bg-ink-raised text-on-ink", !inert && "hover-fine:border-on-ink-soft", inert && "opacity-50")
        : cn("border border-line-strong bg-card text-ink", !inert && "hover-fine:border-ink", inert && "opacity-50");
    case "ghost":
      return onInk
        ? cn("text-on-ink", !inert && "hover-fine:bg-white/8", inert && "opacity-50")
        : cn("text-ink", !inert && "hover-fine:bg-ink/6", inert && "opacity-50");
  }
}

function Inner({ loading, success, icon, iconAfter, children }: Pick<Common, "loading" | "success" | "icon" | "iconAfter" | "children">) {
  const hide = loading || success;
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center gap-2 transition-[opacity,filter] duration-200 ease-[var(--ease-out)]",
          hide && "opacity-0 blur-[2px]",
        )}
      >
        {icon}
        {children}
        {iconAfter}
      </span>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-[opacity,filter] duration-200 ease-[var(--ease-out)]",
          loading ? "opacity-100" : "opacity-0 blur-[2px]",
        )}
      >
        <PunchDots />
      </span>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-[opacity,filter,transform] duration-200 ease-[var(--ease-out)]",
          success ? "scale-100 opacity-100" : "scale-90 opacity-0 blur-[2px]",
        )}
      >
        <Check size={20} strokeWidth={2.25} />
      </span>
    </>
  );
}

/** Three holes punched in turn: the loading indicator for actions. */
export function PunchDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-current opacity-30 [animation:punch-dot_900ms_var(--ease-out)_infinite] motion-reduce:[animation-duration:1800ms]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, success, icon, iconAfter, block, onInk = false, className, children, disabled, type, onClick, ...rest },
  ref,
) {
  const inert = Boolean(disabled);
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-live={loading || success ? "polite" : undefined}
      onClick={(e) => {
        // Loading blocks repeat clicks without dropping focus (no `disabled`).
        if (loading || success) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn(base, sizes[size], variantClass(variant, onInk, inert), block && "w-full", className)}
      {...rest}
    >
      <Inner loading={loading} success={success} icon={icon} iconAfter={iconAfter}>
        {children}
      </Inner>
      {loading ? <span className="sr-only">Working</span> : null}
      {success ? <span className="sr-only">Done</span> : null}
    </button>
  );
});

/** A link that looks like a Button. */
export function ButtonLink({ variant = "primary", size = "md", icon, iconAfter, block, onInk = false, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(base, sizes[size], variantClass(variant, onInk, false), block && "w-full", className)} {...rest}>
      <Inner icon={icon} iconAfter={iconAfter}>
        {children}
      </Inner>
    </Link>
  );
}

/**
 * Success of a money action: the button shows a check for 1.2 seconds.
 *   const [ok, flash] = useSuccessFlash();
 *   <Button success={ok} onClick={async () => { await save(); flash(); }}>
 */
export function useSuccessFlash(ms = 1200): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, flash];
}
