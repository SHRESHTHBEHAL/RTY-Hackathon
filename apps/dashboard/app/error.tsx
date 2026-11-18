"use client";

import { RouteError } from "@/components/RouteError";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <RouteError {...props} />
    </div>
  );
}
