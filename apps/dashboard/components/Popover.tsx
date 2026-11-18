"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, exitOf } from "./motion-tokens";

type TriggerProps = {
  ref: (el: HTMLElement | null) => void;
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-haspopup": "menu" | "dialog";
  "aria-controls": string;
};

export type PopoverProps = {
  /** Render the trigger; spread the props onto a button. */
  trigger: (props: TriggerProps, open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Horizontal alignment to the trigger. */
  align?: "start" | "end" | "center";
  /** Preferred side; flips when there is no room. */
  side?: "bottom" | "top";
  /** Width of the panel in px, or "trigger" to match it. */
  width?: number | "trigger";
  role?: "menu" | "dialog";
  label?: string;
  onInk?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type Placement = { top: number; left: number; originX: number; originY: "top" | "bottom"; width?: number };

/**
 * Floating panel anchored to its trigger. It scales from 0.96 out of the
 * trigger itself (transform-origin is set to the trigger's centre), 200ms in,
 * 120ms out. Closes on Escape, outside click and scroll-away.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  side = "bottom",
  width,
  role = "dialog",
  label,
  onInk,
  className,
  open: openProp,
  onOpenChange,
}: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setOpenState(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );
  const reduce = useReducedMotion();
  const triggerEl = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [mounted, setMounted] = useState(false);
  const id = useId();
  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const t = triggerEl.current?.getBoundingClientRect();
    const p = panel.current;
    if (!t) return;
    // offset sizes ignore the entrance scale transform.
    const pw = width === "trigger" ? t.width : (width ?? p?.offsetWidth ?? 220);
    const ph = p?.offsetHeight ?? 0;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "start" ? t.left : align === "end" ? t.right - pw : t.left + t.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    const roomBelow = vh - t.bottom - gap;
    const below = side === "bottom" ? roomBelow >= ph || roomBelow >= t.top : !(t.top - gap >= ph);
    const top = below ? t.bottom + gap : t.top - gap - ph;
    const originX = Math.max(0, Math.min(pw, t.left + t.width / 2 - left));
    setPlace({ top, left, originX, originY: below ? "top" : "bottom", width: width === "trigger" ? t.width : width });
  }, [align, side, width]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || triggerEl.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerEl.current?.focus();
      }
    };
    const onScroll = () => measure();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, setOpen, measure]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <>
      {trigger(
        {
          ref: (el) => {
            triggerEl.current = el;
          },
          onClick: () => setOpen(!open),
          "aria-expanded": open,
          "aria-haspopup": role,
          "aria-controls": id,
        },
        open,
      )}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  key="pop"
                  ref={panel}
                  id={id}
                  role={role === "dialog" ? "dialog" : undefined}
                  aria-label={label}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1, transition: { duration: DUR.standard, ease: EASE_OUT } }}
                  exit={{ opacity: 0, scale: reduce ? 1 : 0.96, transition: { duration: exitOf(DUR.standard), ease: EASE_OUT } }}
                  style={{
                    position: "fixed",
                    top: place?.top ?? -9999,
                    left: place?.left ?? -9999,
                    width: place?.width,
                    transformOrigin: place ? `${place.originX}px ${place.originY}` : "50% 0",
                    visibility: place ? "visible" : "hidden",
                  }}
                  className={cn(
                    "z-50 min-w-[200px] overflow-hidden rounded-[12px] border shadow-pop",
                    onInk ? "surface-ink border-ink-line" : "border-line bg-card text-ink",
                    className,
                  )}
                >
                  {typeof children === "function" ? children(close) : children}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  /** danger: destructive, separated visually. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Draw a divider above this item. */
  separated?: boolean;
};

export type MenuProps = Omit<PopoverProps, "children" | "role"> & {
  items: MenuItem[];
  /** Small heading inside the menu, e.g. the account email. */
  header?: ReactNode;
};

/** A Popover with menu semantics and arrow-key navigation. */
export function Menu({ items, header, onInk, ...pop }: MenuProps) {
  return (
    <Popover {...pop} role="menu" onInk={onInk}>
      {(close) => <MenuList items={items} header={header} onInk={onInk} label={pop.label} close={close} />}
    </Popover>
  );
}

function MenuList({ items, header, onInk, label, close }: { items: MenuItem[]; header?: ReactNode; onInk?: boolean; label?: string; close: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  function focusAt(delta: number) {
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (!nodes.length) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(i + delta + nodes.length) % nodes.length]!.focus();
  }

  return (
    <div
      ref={listRef}
      role="menu"
      aria-label={label}
      className="p-1.5"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") (e.preventDefault(), focusAt(1));
        if (e.key === "ArrowUp") (e.preventDefault(), focusAt(-1));
        if (e.key === "Tab") close();
      }}
    >
      {header ? <div className={cn("px-3 pb-2 pt-1.5 text-sm", onInk ? "text-on-ink-soft" : "text-ink-soft")}>{header}</div> : null}
      {items.map((it) => {
        const Icon = it.icon;
        const cls = cn(
          "flex h-11 w-full cursor-pointer items-center gap-3 rounded-[8px] px-3 text-left text-[15px] font-medium outline-none transition-colors duration-[var(--dur-quick)]",
          it.tone === "danger" ? (onInk ? "text-stop-bright" : "text-stop-text") : onInk ? "text-on-ink" : "text-ink",
          onInk ? "hover-fine:bg-white/8 focus-visible:bg-white/10" : "hover-fine:bg-ink/5 focus-visible:bg-ink/6",
          it.disabled && "pointer-events-none opacity-45",
        );
        const content = (
          <>
            {Icon ? <Icon size={18} strokeWidth={1.75} aria-hidden /> : null}
            {it.label}
          </>
        );
        return (
          <div key={it.label} role="none">
            {it.separated ? <div role="separator" className={cn("mx-2 my-1.5 h-px", onInk ? "bg-ink-line" : "bg-line")} /> : null}
            {it.href ? (
              <Link role="menuitem" href={it.href} className={cls} onClick={close} aria-disabled={it.disabled || undefined} tabIndex={-1}>
                {content}
              </Link>
            ) : (
              <button
                role="menuitem"
                type="button"
                className={cls}
                tabIndex={-1}
                aria-disabled={it.disabled || undefined}
                onClick={() => {
                  close();
                  it.onSelect?.();
                }}
              >
                {content}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
