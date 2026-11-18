import { cn } from "@/lib/cn";

export type SkeletonProps = {
  /** line: one text line; block: any box (set size with className); circle */
  shape?: "line" | "block" | "circle";
  className?: string;
  onInk?: boolean;
};

/**
 * Loading placeholder. A soft sheen passes over it; under reduced motion it
 * is still. Always a skeleton for data, never a spinner (DESIGN.md).
 */
export function Skeleton({ shape = "line", className, onInk }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block overflow-hidden",
        onInk ? "bg-white/8" : "bg-ink/7",
        shape === "line" && "h-3.5 rounded-full",
        shape === "block" && "h-24 rounded-[10px]",
        shape === "circle" && "size-10 rounded-full",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent [animation:skeleton-sheen_1.6s_var(--ease-in-out)_infinite] motion-reduce:hidden",
          onInk ? "via-white/8" : "via-white/70",
        )}
      />
    </span>
  );
}

/** A few skeleton lines with a screen-reader status. */
export function SkeletonText({ lines = 3, className, label = "Loading" }: { lines?: number; className?: string; label?: string }) {
  return (
    <div role="status" className={cn("flex flex-col gap-2.5", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? "w-3/5" : undefined} />
      ))}
    </div>
  );
}
