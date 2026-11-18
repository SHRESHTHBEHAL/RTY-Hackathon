import { cn } from "@/lib/cn";

/** The gate mark: two arms parted around a token. */
export function GateMark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={cn("shrink-0", className)} fill="none">
      <rect x="4" y="2" width="3.2" height="20" rx="1.6" fill="currentColor" />
      <rect x="16.8" y="2" width="3.2" height="20" rx="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="3" fill="var(--pass)" />
    </svg>
  );
}

/** Wordmark. `onInk` for dark surfaces. */
export function Logo({ className, onInk, size = "md" }: { className?: string; onInk?: boolean; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", onInk ? "text-on-ink" : "text-ink", className)}>
      <GateMark size={size === "lg" ? 30 : 22} className={onInk ? "text-on-ink" : "text-ink"} />
      <span className={cn("font-display tracking-[0.02em]", size === "lg" ? "text-[30px]" : "text-[22px]")}>Gaitway</span>
    </span>
  );
}
