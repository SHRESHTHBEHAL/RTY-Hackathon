"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, exitOf } from "./motion-tokens";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom, right-aligned. Put the primary action last. */
  footer?: ReactNode;
  /** sm 420, md 520 (default), lg 680 */
  size?: "sm" | "md" | "lg";
  /** Block closing by Escape and backdrop while something is in flight. */
  dismissable?: boolean;
  /** Element to focus first; defaults to the first focusable control. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  className?: string;
};

const widths = { sm: "max-w-[420px]", md: "max-w-[520px]", lg: "max-w-[680px]" } as const;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog. Scales from 0.96 with a fade, centred, 320ms in and 60
 * percent of that out. Traps focus, closes on Escape and backdrop click,
 * returns focus to whatever opened it.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", dismissable = true, initialFocus, className }: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current;
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prevOverflow;
      opener.current?.focus?.();
    };
  }, [open, initialFocus]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && dismissable) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="dialog"
          className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6"
          onKeyDown={onKeyDown}
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.slow, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: exitOf(DUR.slow) } }}
            onClick={dismissable ? onClose : undefined}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: DUR.slow, ease: EASE_OUT } }}
            exit={reduce ? { opacity: 0, transition: { duration: exitOf(DUR.slow) } } : { opacity: 0, scale: 0.96, transition: { duration: exitOf(DUR.slow), ease: EASE_OUT } }}
            className={cn(
              "relative flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-[14px] border border-line bg-card text-ink shadow-pop outline-none",
              widths[size],
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-xl font-semibold leading-tight">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-1.5 text-[15px] text-ink-soft">
                    {description}
                  </p>
                ) : null}
              </div>
              {dismissable ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="pressable -mr-2 -mt-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-ink-soft hover-fine:bg-ink/6 hover-fine:text-ink"
                >
                  <X size={20} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
            {children ? <div className="overflow-y-auto px-6 pb-2 pt-5">{children}</div> : <div className="pb-2" />}
            {footer ? <div className="flex flex-col-reverse gap-2 px-6 pb-6 pt-4 sm:flex-row sm:justify-end">{footer}</div> : <div className="pb-4" />}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
