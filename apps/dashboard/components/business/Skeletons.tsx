import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/cn";

/** Route loading states: the page's shape in skeletons, never a spinner. */

export function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-3">
        <Skeleton className="w-20" />
        <Skeleton shape="block" className="h-11 w-56 rounded-[8px]" />
      </div>
      {action ? <Skeleton shape="block" className="h-11 w-36" /> : null}
    </div>
  );
}

export function PassSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[14px] border border-line bg-card", className)}>
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="w-20" />
        <Skeleton shape="block" className="h-7 w-32 rounded-[6px]" />
        <div className="mt-3 flex items-end justify-between">
          <Skeleton shape="block" className="h-10 w-28 rounded-[6px]" />
          <Skeleton className="w-14" />
        </div>
      </div>
      <div className="border-t border-dashed border-line-strong px-5 py-4">
        <Skeleton className="w-40" />
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-[14px] border border-line bg-card px-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line py-4 last:border-0">
          <Skeleton shape="circle" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={i % 2 ? "w-1/2" : "w-2/3"} />
            <Skeleton className="w-20" />
          </div>
          <Skeleton className="w-16" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ hero = false, passes = 0, rows = 6, label = "Loading" }: { hero?: boolean; passes?: number; rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <HeaderSkeleton />
      <div className="flex flex-col gap-10">
        {hero ? <Skeleton shape="block" onInk={false} className="h-[340px] rounded-[18px]" /> : null}
        {passes > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: passes }, (_, i) => (
              <PassSkeleton key={i} />
            ))}
          </div>
        ) : null}
        {rows > 0 ? <RowsSkeleton rows={rows} /> : null}
      </div>
    </div>
  );
}
