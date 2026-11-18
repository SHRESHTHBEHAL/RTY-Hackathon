"use client";

import { useEffect } from "react";
import { ErrorState } from "./ErrorState";

/**
 * Drop-in body for any error.tsx route boundary: a plain explanation and a
 * retry, never a blank page.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-[14px] border border-line bg-card">
      <ErrorState
        title="This page did not load"
        message="Gaitway did not answer in time or sent something unexpected. Try again in a moment."
        code={error.digest ? `ref ${error.digest}` : undefined}
        onRetry={reset}
      />
    </div>
  );
}
