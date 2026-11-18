"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { CircleAlert } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, SHAKE, SHAKE_X } from "./motion-tokens";

type FieldCtx = { id: string; describedBy: string | undefined; invalid: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

/** Inputs inside a Field read their id and aria wiring from here. */
export function useField(): FieldCtx | null {
  return useContext(FieldContext);
}

export type FieldProps = {
  label: ReactNode;
  /** Persistent help under the control. */
  helper?: ReactNode;
  /** Error message; the field shakes once each time it appears or changes. */
  error?: string | null;
  /** Bump to shake again for the same message (e.g. a repeat submit). */
  errorKey?: number | string;
  /** Extra at the label's right, e.g. a "Forgot?" link or a counter. */
  aside?: ReactNode;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  optional?: boolean;
  id?: string;
  className?: string;
  onInk?: boolean;
  children: ReactNode;
};

export function Field({ label, helper, error, errorKey, aside, hideLabel, optional, id: idProp, className, onInk, children }: FieldProps) {
  const auto = useId();
  const id = idProp ?? `f${auto.replace(/:/g, "")}`;
  const helperId = helper ? `${id}-help` : undefined;
  const errorId = error ? `${id}-err` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!error) return;
    }
    if (error && !reduce) void controls.start({ x: SHAKE_X, transition: SHAKE });
  }, [error, errorKey, reduce, controls]);

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className={cn("flex items-baseline justify-between gap-3", hideLabel && "sr-only")}>
          <label htmlFor={id} className={cn("text-sm font-semibold", onInk ? "text-on-ink" : "text-ink")}>
            {label}
            {optional ? <span className={cn("ml-1.5 font-normal", onInk ? "text-on-ink-soft" : "text-ink-soft")}>optional</span> : null}
          </label>
          {aside ? <div className="text-sm">{aside}</div> : null}
        </div>
        <motion.div animate={controls}>{children}</motion.div>
        <AnimatePresence initial={false} mode="popLayout">
          {error ? (
            <motion.p
              key={error}
              id={errorId}
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: DUR.standard, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
              className={cn("flex items-start gap-1.5 text-sm font-medium", onInk ? "text-stop-bright" : "text-stop-text")}
            >
              <CircleAlert size={16} strokeWidth={2} className="mt-[3px] shrink-0" aria-hidden />
              <span>{error}</span>
            </motion.p>
          ) : null}
        </AnimatePresence>
        {helper ? (
          <p id={helperId} className={cn("text-sm", onInk ? "text-on-ink-soft" : "text-ink-soft")}>
            {helper}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
