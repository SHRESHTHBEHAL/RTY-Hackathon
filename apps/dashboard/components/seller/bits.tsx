"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { CircleAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { ErrorState } from "@/components/ErrorState";
import { DUR, EASE_OUT, SHAKE, SHAKE_X } from "@/components/motion-tokens";
import { formatDateTime } from "@/lib/format";

/** A load failure inside a page: plain words and a retry that refetches on the server. */
export function LoadError({ message, code }: { message: string; code?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="rounded-[14px] border border-line bg-card">
      <ErrorState
        message={message}
        code={code}
        onRetry={() =>
          new Promise<void>((resolve) => {
            start(() => router.refresh());
            setTimeout(resolve, 700);
          })
        }
      />
    </div>
  );
}

/** Dates are shown in the viewer's time zone; the server's may differ, so skip the hydration check. */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning className={className}>
      {formatDateTime(iso)}
    </time>
  );
}

/** A form-level error (not tied to one field). Shakes each time it changes. */
export function FormError({ message, errorKey }: { message?: string | null; errorKey?: number }) {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!message) return;
    }
    if (message && !reduce) void controls.start({ x: SHAKE_X, transition: SHAKE });
  }, [message, errorKey, reduce, controls]);
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div
          key="fe"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DUR.standard, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
        >
          <motion.p animate={controls} role="alert" className="flex items-start gap-2 rounded-[10px] border border-stop/30 bg-stop/8 px-3.5 py-2.5 text-sm font-medium text-stop-text">
            <CircleAlert size={16} strokeWidth={2} className="mt-[3px] shrink-0" aria-hidden />
            <span>{message}</span>
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="pressable -ml-2 mb-4 inline-flex h-11 items-center gap-1.5 rounded-[10px] px-2 text-[15px] font-semibold text-ink-soft hover-fine:bg-ink/6 hover-fine:text-ink"
    >
      <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
      {children}
    </Link>
  );
}

/** "0x12ab…ef90" for long transaction references. */
export function shortRef(ref: string, keep = 6): string {
  return ref.length <= keep * 2 + 3 ? ref : `${ref.slice(0, keep + 2)}…${ref.slice(-keep)}`;
}
