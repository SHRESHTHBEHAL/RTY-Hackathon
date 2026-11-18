"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useField } from "./Field";

export type InputProps = Omit<ComponentProps<"input">, "prefix"> & {
  /** Text or icon inside the left edge, e.g. "$". */
  prefix?: ReactNode;
  /** Text or icon inside the right edge, e.g. "USD". */
  suffix?: ReactNode;
  /** JetBrains Mono with tabular figures, for amounts, IDs and keys. */
  mono?: boolean;
  /** Mark invalid without a Field (a Field sets this for you). */
  invalid?: boolean;
  /** Password fields get a show/hide toggle. */
  revealable?: boolean;
  onInk?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, mono, invalid: invalidProp, revealable, onInk, className, id: idProp, type, disabled, readOnly, ...rest },
  ref,
) {
  const field = useField();
  const invalid = invalidProp ?? field?.invalid ?? false;
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && revealable && shown ? "text" : type;

  return (
    <div
      className={cn(
        "group/input relative flex h-11 items-center rounded-[10px] border transition-[border-color,box-shadow,background-color] duration-[var(--dur-quick)] ease-[var(--ease-out)]",
        onInk ? "bg-ink-raised text-on-ink" : "bg-card text-ink",
        invalid
          ? "border-stop shadow-[0_0_0_3px_color-mix(in_srgb,var(--stop)_16%,transparent)]"
          : onInk
            ? "border-ink-line focus-within:border-pass-bright"
            : "border-line-strong focus-within:border-pass",
        // DESIGN.md focus ring: 2px pass, 2px offset, drawn on the whole control.
        "focus-within:outline-2 focus-within:outline-offset-2",
        onInk ? "focus-within:outline-pass-bright" : "focus-within:outline-pass",
        disabled && "opacity-55",
        readOnly && !onInk && "bg-paper",
        className,
      )}
    >
      {prefix ? (
        <span className={cn("pointer-events-none flex items-center pl-3.5 text-[15px]", onInk ? "text-on-ink-soft" : "text-ink-soft", mono && "font-mono")}>
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        id={idProp ?? field?.id}
        type={effectiveType}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={field?.describedBy}
        className={cn(
          "peer h-full w-full min-w-0 rounded-[10px] bg-transparent px-3.5 text-base outline-none placeholder:text-ink-soft/60",
          onInk && "placeholder:text-on-ink-soft/60",
          prefix ? "pl-1.5" : "",
          mono && "font-mono tabular text-[15px]",
          // The wrapper draws the focus ring.
          "focus-visible:outline-none",
        )}
        {...rest}
      />
      {isPassword && revealable ? (
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className={cn(
            "pressable mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px]",
            onInk ? "text-on-ink-soft hover-fine:bg-white/8" : "text-ink-soft hover-fine:bg-ink/6",
          )}
        >
          {shown ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
        </button>
      ) : null}
      {suffix ? (
        <span className={cn("pointer-events-none flex items-center pr-3.5 text-sm", onInk ? "text-on-ink-soft" : "text-ink-soft")}>{suffix}</span>
      ) : null}
    </div>
  );
});

export type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid: invalidProp, className, id: idProp, ...rest },
  ref,
) {
  const field = useField();
  const invalid = invalidProp ?? field?.invalid ?? false;
  return (
    <textarea
      ref={ref}
      id={idProp ?? field?.id}
      aria-invalid={invalid || undefined}
      aria-describedby={field?.describedBy}
      className={cn(
        "min-h-24 w-full rounded-[10px] border bg-card px-3.5 py-2.5 text-base text-ink outline-none transition-[border-color,box-shadow] duration-[var(--dur-quick)] placeholder:text-ink-soft/60",
        invalid ? "border-stop" : "border-line-strong focus:border-pass",
        className,
      )}
      {...rest}
    />
  );
});
