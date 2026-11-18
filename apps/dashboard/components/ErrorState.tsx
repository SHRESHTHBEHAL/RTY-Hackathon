"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export type ErrorStateProps = {
  title?: string;
  /** What happened and what to do. */
  message?: ReactNode;
  /** Called by "Try again". May return a promise; the button shows loading until it settles. */
  onRetry?: () => unknown;
  retryLabel?: string;
  /** Error code for support, shown small in mono. */
  code?: string;
  size?: "default" | "compact";
  className?: string;
};

export function ErrorState({
  title = "This did not load",
  message = "Gaitway did not answer. Check your connection, then try again.",
  onRetry,
  retryLabel = "Try again",
  code,
  size = "default",
  className,
}: ErrorStateProps) {
  const [busy, setBusy] = useState(false);
  return (
    <div role="alert" className={cn("flex flex-col items-center text-center", size === "default" ? "px-6 py-14" : "px-4 py-8", className)}>
      <span className="mb-4 flex size-12 items-center justify-center rounded-full border border-stop/30 bg-stop/8 text-stop-text">
        <TriangleAlert size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[15px] text-ink-soft">{message}</p>
      {code ? <p className="mt-2 font-mono text-xs text-ink-soft">{code}</p> : null}
      {onRetry ? (
        <div className="mt-5">
          <Button
            variant="secondary"
            icon={<RotateCw size={18} strokeWidth={1.75} aria-hidden />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRetry();
              } finally {
                setBusy(false);
              }
            }}
          >
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
