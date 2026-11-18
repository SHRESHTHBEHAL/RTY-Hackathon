"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ban, Check, Info, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, SPRING, exitOf } from "./motion-tokens";

export type ToastTone = "neutral" | "success" | "error";
type ToastItem = { id: number; tone: ToastTone; title: string; body?: string; duration: number };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Show a toast from anywhere in client code. Place <Toaster /> once (the root
 * layout does). Toasts never take focus; screen readers hear them politely.
 *   toast.success("Key revoked")
 *   toast.error("Not enough balance", "Top up first.")
 */
export function toast(title: string, opts: { tone?: ToastTone; body?: string; duration?: number } = {}): number {
  const id = nextId++;
  items = [...items, { id, tone: opts.tone ?? "neutral", title, body: opts.body, duration: opts.duration ?? 4000 }].slice(-4);
  emit();
  return id;
}
toast.success = (title: string, body?: string) => toast(title, { tone: "success", body });
toast.error = (title: string, body?: string) => toast(title, { tone: "error", body, duration: 6000 });
toast.dismiss = (id: number) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:bottom-2 sm:items-end sm:p-6"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ item, ref }: { item: ToastItem; ref?: React.Ref<HTMLDivElement> }) {
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(item.duration);
  const started = useRef(0);

  const start = () => {
    started.current = Date.now();
    timer.current = setTimeout(() => toast.dismiss(item.id), remaining.current);
  };
  const pause = () => {
    if (timer.current) clearTimeout(timer.current);
    remaining.current -= Date.now() - started.current;
  };

  useEffect(() => {
    start();
    const onVis = () => (document.hidden ? pause() : start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = item.tone === "success" ? Check : item.tone === "error" ? Ban : Info;
  return (
    <motion.div
      ref={ref}
      layout={!reduce}
      role="status"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: DUR.standard } : SPRING }}
      exit={{ opacity: 0, y: reduce ? 0 : 16, transition: { duration: exitOf(DUR.slow), ease: EASE_OUT } }}
      onPointerEnter={pause}
      onPointerLeave={start}
      className="surface-ink pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-[12px] border border-ink-line p-3.5 pr-2 shadow-pop"
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          item.tone === "success" ? "bg-go-bright/15 text-go-bright" : item.tone === "error" ? "bg-stop/20 text-stop-bright" : "bg-white/10 text-on-ink",
        )}
      >
        <Icon size={14} strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-[15px] font-semibold leading-snug">{item.title}</p>
        {item.body ? <p className="mt-0.5 text-sm text-on-ink-soft">{item.body}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(item.id)}
        aria-label="Dismiss"
        className="pressable -my-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-on-ink-soft hover-fine:bg-white/8 hover-fine:text-on-ink"
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </motion.div>
  );
}
