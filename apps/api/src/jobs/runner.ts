import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import { runDepositJob } from "./deposits.js";
import { runSweeper } from "./sweeper.js";
import { runSettlement } from "./settlement.js";
import { runReconcile, type ReconcileResult } from "./reconcile.js";

export type JobsHandle = { stop(): void; lastReconcile(): ReconcileResult | null };

/**
 * Deposit job and sweeper every 5 seconds; settlement every
 * SETTLE_INTERVAL_SECONDS, followed by reconciliation. Runs never overlap.
 */
export function startJobs(deps: Deps): JobsHandle {
  const log = logOf(deps);
  let last: ReconcileResult | null = null;
  const guard = (name: string, fn: () => Promise<unknown>) => {
    let running = false;
    return async () => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (e) {
        log(`${name} failed`, { error: (e as Error).message });
      } finally {
        running = false;
      }
    };
  };
  const fast = guard("deposits/sweeper", async () => {
    await runDepositJob(deps);
    await runSweeper(deps);
  });
  const settle = guard("settlement", async () => {
    const r = await runSettlement(deps);
    if (r.batchId) log(`settlement batch ${r.batchId} done`);
    last = await runReconcile(deps);
  });
  const t1 = setInterval(fast, 5000);
  const t2 = setInterval(settle, deps.config.settleIntervalSeconds * 1000);
  void fast();
  return {
    stop() {
      clearInterval(t1);
      clearInterval(t2);
    },
    lastReconcile: () => last,
  };
}
