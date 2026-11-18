"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="surface-ink grid min-h-dvh place-items-center p-6">
      <div className="max-w-md rounded-[14px] border border-ink-line bg-ink-raised [&_h3]:text-on-ink [&_p]:text-on-ink-soft">
        <ErrorState
          title="The demo did not load"
          message="Gaitway did not answer in time or sent something unexpected. Try again in a moment."
          code={error.digest ? `ref ${error.digest}` : undefined}
          onRetry={reset}
        />
      </div>
    </main>
  );
}
