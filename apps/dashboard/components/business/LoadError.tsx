"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/ErrorState";
import { cn } from "@/lib/cn";

/** A data view that failed to load: what happened, and a retry that refetches the page. */
export function LoadError({ message, title = "This did not load", compact, className }: { message: string; title?: string; compact?: boolean; className?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className={cn("rounded-[14px] border border-line bg-card", className)}>
      <ErrorState
        title={title}
        message={message}
        size={compact ? "compact" : "default"}
        onRetry={() =>
          new Promise<void>((resolve) => {
            start(() => router.refresh());
            setTimeout(resolve, 700);
          })
        }
      />
    </div>
  );
}
