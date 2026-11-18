"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ErrorState";

/** API-down state for public server pages: says what happened, retries in place. */
export function PublicError({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  return (
    <div className="rounded-[14px] border border-line bg-card">
      <ErrorState title={title} message={message} onRetry={() => router.refresh()} />
    </div>
  );
}
