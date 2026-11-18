"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refreshes the server-rendered data every few seconds while the tab is
 * visible. router.refresh() keeps client state, so entrance animations do
 * not replay and only changed numbers roll.
 */
export function Poller({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || document.visibilityState !== "visible") return;
      timer = setInterval(() => router.refresh(), every);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else stop();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, every]);
  return null;
}
