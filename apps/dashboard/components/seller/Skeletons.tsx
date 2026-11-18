import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/Skeleton";

type Variant = "overview" | "table" | "cards" | "detail" | "form";

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="border-b border-line bg-paper/50 px-5 py-4">
        <Skeleton className="w-40" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 border-b border-line px-5 py-4 last:border-0">
          <Skeleton className="w-32" />
          <Skeleton className="hidden w-24 sm:block" />
          <Skeleton className="w-16" />
        </div>
      ))}
    </div>
  );
}

/** Route-level loading state: the real title, skeletons for everything that is data. */
export function SellerSkeleton({ eyebrow = "Seller", title, variant }: { eyebrow?: string; title: string; variant: Variant }) {
  return (
    <div role="status" aria-label={`Loading ${title.toLowerCase()}`}>
      <span className="sr-only">Loading</span>
      <PageHeader eyebrow={eyebrow} title={title} />
      {variant === "overview" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            {[0, 1].map((i) => (
              <Card key={i}>
                <Skeleton className="w-24" />
                <Skeleton shape="block" className="mt-6 h-16 w-3/4" />
                <Skeleton className="mt-6 w-40" />
              </Card>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
            <Card>
              <Skeleton className="mb-6 w-28" />
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex justify-between border-b border-line py-3.5 last:border-0">
                  <Skeleton className="w-40" />
                  <Skeleton className="w-14" />
                </div>
              ))}
            </Card>
            <Card>
              <Skeleton className="mb-6 w-32" />
              <Skeleton shape="block" className="h-40" />
            </Card>
          </div>
        </div>
      ) : variant === "table" ? (
        <TableSkeleton />
      ) : variant === "cards" ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <Skeleton className="w-40" />
              <Skeleton className="mt-4 w-full" />
              <Skeleton className="mt-2 w-2/3" />
              <Skeleton shape="block" className="mt-6 h-11" />
            </Card>
          ))}
        </div>
      ) : variant === "detail" ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <Skeleton shape="block" className="h-16 w-1/2" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex justify-between border-b border-line py-4 last:border-0">
                <Skeleton className="w-20" />
                <Skeleton className="w-32" />
              </div>
            ))}
          </Card>
          <Card>
            <Skeleton className="w-32" />
            <Skeleton shape="block" className="mt-5 h-24" />
            <Skeleton shape="block" className="mt-4 h-11" />
          </Card>
        </div>
      ) : (
        <Card className="max-w-2xl">
          <Skeleton className="w-28" />
          <Skeleton shape="block" className="mt-4 h-11" />
          <Skeleton shape="block" className="mt-6 h-11 w-40" />
        </Card>
      )}
    </div>
  );
}
