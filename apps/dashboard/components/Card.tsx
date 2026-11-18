import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardProps = Pick<ComponentProps<"div">, "id" | "style" | "children" | "className" | "aria-label" | "aria-labelledby" | "role"> & {
  /** paper card (default) or a raised panel on ink. */
  tone?: "card" | "ink";
  /** none | sm 16 | md 24 (default) | lg 32 */
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article" | "li";
  /** Optional header row: eyebrow-style title at left, actions at right. */
  title?: ReactNode;
  actions?: ReactNode;
};

const pad = { none: "", sm: "p-4", md: "p-6", lg: "p-8" } as const;

/** Ordinary card: 14px radius, 1px line border, no shadow on paper. */
export function Card({ tone = "card", padding = "md", as = "div", title, actions, className, children, ...rest }: CardProps) {
  const Tag = as as "div";
  return (
    <Tag
      className={cn(
        "rounded-[14px] border",
        tone === "card" ? "border-line bg-card text-ink" : "border-ink-line bg-ink-raised text-on-ink",
        pad[padding],
        className,
      )}
      {...rest}
    >
      {title || actions ? (
        <div className={cn("mb-4 flex min-h-8 items-center justify-between gap-3", padding === "none" && "mb-0 px-6 pt-5 pb-4")}>
          {title ? <h2 className={cn("eyebrow", tone === "ink" && "text-on-ink-soft!")}>{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
