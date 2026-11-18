import { Ban, Check, CircleDashed, Clock3, FlaskConical, Pause, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "pass" | "go" | "stop" | "hold" | "test";

export type BadgeProps = {
  tone?: BadgeTone;
  /** A lucide icon component. Colour never carries meaning alone: pair a tone with an icon and a word. */
  icon?: LucideIcon;
  onInk?: boolean;
  className?: string;
  children: ReactNode;
};

const paper: Record<BadgeTone, string> = {
  neutral: "bg-ink/6 text-ink-soft border-line",
  pass: "bg-pass/8 text-pass border-pass/25",
  go: "bg-go/10 text-go-text border-go/30",
  stop: "bg-stop/10 text-stop-text border-stop/30",
  hold: "bg-hold/10 text-hold-text border-hold/35",
  test: "bg-hold-bright/18 text-hold-text border-hold/35",
};

const ink: Record<BadgeTone, string> = {
  neutral: "bg-white/6 text-on-ink-soft border-ink-line",
  pass: "bg-pass-bright/12 text-pass-bright border-pass-bright/30",
  go: "bg-go-bright/12 text-go-bright border-go-bright/30",
  stop: "bg-stop/16 text-stop-bright border-stop/40",
  hold: "bg-hold-bright/14 text-hold-bright border-hold-bright/35",
  test: "bg-hold-bright/14 text-hold-bright border-hold-bright/35",
};

export function Badge({ tone = "neutral", icon: Icon, onInk, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold leading-none",
        onInk ? ink[tone] : paper[tone],
        className,
      )}
    >
      {Icon ? <Icon size={13} strokeWidth={2.25} aria-hidden className="-ml-0.5" /> : null}
      {children}
    </span>
  );
}

/** The test-mode marker used in both shells. */
export function TestModeBadge({ onInk, className }: { onInk?: boolean; className?: string }) {
  return (
    <Badge tone="test" icon={FlaskConical} onInk={onInk} className={cn("uppercase tracking-[0.06em]", className)}>
      Test mode
    </Badge>
  );
}

type Status =
  | "active"
  | "disabled"
  | "pending"
  | "confirmed"
  | "failed"
  | "sent"
  | "released"
  | "expired"
  | "exhausted"
  | "revoked"
  | "approved"
  | "refused";

const STATUS: Record<Status, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  active: { tone: "go", icon: Check, label: "Active" },
  disabled: { tone: "neutral", icon: Pause, label: "Disabled" },
  pending: { tone: "hold", icon: Clock3, label: "Pending" },
  confirmed: { tone: "go", icon: Check, label: "Confirmed" },
  failed: { tone: "stop", icon: Ban, label: "Failed" },
  sent: { tone: "go", icon: Check, label: "Sent" },
  released: { tone: "neutral", icon: CircleDashed, label: "Released" },
  expired: { tone: "neutral", icon: Clock3, label: "Expired" },
  exhausted: { tone: "neutral", icon: CircleDashed, label: "Used up" },
  revoked: { tone: "stop", icon: Ban, label: "Revoked" },
  approved: { tone: "go", icon: Check, label: "Approved" },
  refused: { tone: "stop", icon: Ban, label: "Refused" },
};

/** One badge per status word in the contract, with the right icon and wording. */
export function StatusBadge({ status, onInk, className }: { status: Status; onInk?: boolean; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon} onInk={onInk} className={className}>
      {s.label}
    </Badge>
  );
}
export type { Status as StatusBadgeStatus };
