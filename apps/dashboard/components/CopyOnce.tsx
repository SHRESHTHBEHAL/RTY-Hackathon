"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, SPRING_LANDING } from "./motion-tokens";
import { TicketCard } from "./TicketCard";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type CopyButtonProps = {
  value: string;
  /** Accessible name, e.g. "Copy wallet ID". */
  label?: string;
  /** Show the word next to the icon. */
  showText?: boolean;
  onInk?: boolean;
  className?: string;
  onCopied?: () => void;
};

/** Small copy control for IDs and snippets. Shows a check for 1.2 seconds. */
export function CopyButton({ value, label = "Copy", showText = false, onInk, className, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);
  return (
    <button
      type="button"
      aria-label={showText ? undefined : label}
      onClick={async () => {
        if (await writeClipboard(value)) {
          setCopied(true);
          onCopied?.();
          if (t.current) clearTimeout(t.current);
          t.current = setTimeout(() => setCopied(false), 1200);
        }
      }}
      className={cn(
        "pressable inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-sm font-semibold",
        onInk ? "text-on-ink-soft hover-fine:bg-white/8 hover-fine:text-on-ink" : "text-ink-soft hover-fine:bg-ink/6 hover-fine:text-ink",
        className,
      )}
    >
      <span className="relative size-[18px]">
        <AnimatePresence initial={false}>
          <motion.span
            key={copied ? "y" : "n"}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: DUR.standard, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: DUR.quick } }}
          >
            {copied ? <Check size={18} strokeWidth={2} className={onInk ? "text-go-bright" : "text-go-text"} /> : <Copy size={18} strokeWidth={1.75} />}
          </motion.span>
        </AnimatePresence>
      </span>
      {showText ? <span>{copied ? "Copied" : label}</span> : null}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

export type CopyOnceProps = {
  /** The secret. Shown in full, once. Never store it client-side. */
  value: string;
  /** What it is, e.g. "Business API key". */
  label: string;
  /** The warning under the key. */
  warning?: string;
  /** Called after a successful copy. */
  onCopied?: () => void;
  className?: string;
};

/**
 * Shows a secret exactly once: a ticket with the key in mono, a "Copy key"
 * button and a plain warning that it cannot be shown again. The parent owns
 * the value in memory only; after a reload it is gone.
 */
export function CopyOnce({ value, label, warning = "Copy it now and keep it somewhere safe. Gaitway stores only a hash, so this key cannot be shown again.", onCopied, className }: CopyOnceProps) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);

  const selectAll = useCallback(() => {
    const el = codeRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  async function copy() {
    if (await writeClipboard(value)) {
      setCopied(true);
      setManual(false);
      onCopied?.();
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setCopied(false), 1200);
    } else {
      setManual(true);
      selectAll();
    }
  }

  return (
    <TicketCard
      tone="ink"
      className={className}
      aria-label={label}
      stub={
        <div className="flex w-full items-start gap-2.5 py-1">
          <TriangleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-hold-bright" aria-hidden />
          <p className="text-sm text-on-ink-soft">
            <span className="font-semibold text-on-ink">Shown once. </span>
            {manual ? "Copying is blocked here. The key is selected: copy it with your keyboard." : warning}
          </p>
        </div>
      }
    >
      <div className="flex items-center gap-2">
        <KeyRound size={16} strokeWidth={1.75} className="text-on-ink-soft" aria-hidden />
        <p className="eyebrow text-on-ink-soft!">{label}</p>
      </div>
      <code
        ref={codeRef}
        data-testid="copy-once-value"
        onClick={selectAll}
        className="mt-3 block select-all break-all rounded-[10px] border border-ink-line bg-ink px-3.5 py-3 font-mono text-[14px] leading-relaxed text-on-ink sm:text-[15px]"
      >
        {value}
      </code>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className={cn(
            "pressable relative inline-flex h-11 cursor-pointer items-center gap-2 overflow-hidden rounded-[10px] px-4 text-[15px] font-semibold transition-colors",
            copied ? "bg-go-bright text-ink" : "bg-on-ink text-ink hover-fine:bg-white",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={copied ? "done" : "copy"}
              className="inline-flex items-center gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: copied ? SPRING_LANDING : { duration: DUR.standard, ease: EASE_OUT } }}
              exit={{ opacity: 0, y: -6, transition: { duration: DUR.quick } }}
            >
              {copied ? <Check size={18} strokeWidth={2.25} /> : <Copy size={18} strokeWidth={1.75} />}
              {copied ? "Copied" : "Copy key"}
            </motion.span>
          </AnimatePresence>
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Key copied" : ""}
        </span>
      </div>
    </TicketCard>
  );
}
