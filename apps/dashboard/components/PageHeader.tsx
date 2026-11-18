import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PageHeaderProps = {
  /** Small uppercase label above the title, e.g. "Business". */
  eyebrow?: ReactNode;
  /** Display title (rendered uppercase). The page's one h1. */
  title: ReactNode;
  description?: ReactNode;
  /** The page's one primary action, at the right. */
  action?: ReactNode;
  /** Small extras under the title: badges, an ID with copy. */
  meta?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, action, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h1 className="font-display text-[40px] text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-[17px] text-ink-soft">{description}</p> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}
