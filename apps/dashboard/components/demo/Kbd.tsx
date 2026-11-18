import { cn } from "@/lib/cn";

/** A key cap for presenter shortcuts. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-ink-line border-b-2 bg-ink-raised px-1.5 font-mono text-xs font-medium leading-none text-on-ink",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
