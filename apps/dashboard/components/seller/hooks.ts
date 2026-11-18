"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "./result";

/**
 * Poll a server action while the tab is visible. Unchanged data keeps the
 * same object, so nothing re-renders and no animation replays. A failed poll
 * keeps the last good data and sets `stale`.
 */
export function usePolled<T>(initial: T, fetcher: () => Promise<ActionResult<T>>, ms = 3000) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);
  const [beat, setBeat] = useState(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;

  useEffect(() => {
    let alive = true;
    let busy = false;
    const tick = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const r = await latest.current();
        if (!alive) return;
        if (r.ok) {
          setData((prev) => (JSON.stringify(prev) === JSON.stringify(r.data) ? prev : r.data));
          setStale(false);
          setBeat((b) => b + 1);
        } else setStale(true);
      } catch {
        if (alive) setStale(true);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, ms);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);

  return { data, setData, stale, beat };
}

/**
 * One in flight at a time. The lock is a ref, so a second click in the same
 * tick is dropped before React has re-rendered the pending state.
 */
export function useGuard() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }, []);
  return { run, pending };
}

/** "Now" that starts at the server's time (so hydration matches) and then ticks. */
export function useNow(initial: number, ms = 15_000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
