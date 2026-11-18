import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** One or two sentences that invite the first action. */
  body?: ReactNode;
  /** Usually one Button. */
  action?: ReactNode;
  className?: string;
  /** compact for inside tables and cards. */
  size?: "default" | "compact";
};

/** An empty view: an unpunched ticket stub with the icon in its hole. */
export function EmptyState({ icon: Icon, title, body, action, className, size = "default" }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", size === "default" ? "px-6 py-14" : "px-4 py-8", className)}>
      <div className="relative mb-5">
        <div className="flex h-14 w-24 items-center justify-center rounded-[10px] border border-dashed border-line-strong bg-card">
          <span className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-soft">
            <Icon size={18} strokeWidth={1.75} aria-hidden />
          </span>
        </div>
        <span className="absolute -left-[7px] top-1/2 size-3.5 -translate-y-1/2 rounded-full border border-dashed border-line-strong bg-paper" />
        <span className="absolute -right-[7px] top-1/2 size-3.5 -translate-y-1/2 rounded-full border border-dashed border-line-strong bg-paper" />
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-[15px] text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
