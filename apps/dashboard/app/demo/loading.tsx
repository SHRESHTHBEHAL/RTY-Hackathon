import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="surface-ink min-h-dvh px-4 py-5 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading the demo">
      <Skeleton onInk className="h-8 w-72" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} onInk shape="block" className="h-56" />
          ))}
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} onInk shape="block" className="h-56 opacity-50" />
          ))}
        </div>
        <Skeleton onInk shape="block" className="h-[700px]" />
      </div>
    </main>
  );
}
