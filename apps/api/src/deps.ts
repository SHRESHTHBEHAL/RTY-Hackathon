import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { VaultClient } from "./vault/types.js";

export type AppState = {
  /** Set when a settlement batch fails or reconciliation finds a difference. Cleared only by restart. */
  settlementPaused: boolean;
  pauseReason: string | null;
};

export type Hooks = {
  /** Test hook: runs right after vault.settle resolves, before the DB is updated. */
  afterVaultSettle?: (batchId: string) => void | Promise<void>;
  /** Test hook: runs right before vault.settle is called. */
  beforeVaultSettle?: (batchId: string) => void | Promise<void>;
};

export type Deps = {
  sql: Db;
  config: Config;
  vault: VaultClient;
  now: () => Date;
  state: AppState;
  hooks?: Hooks;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
};

export function newState(): AppState {
  return { settlementPaused: false, pauseReason: null };
}

export function logOf(deps: Deps) {
  return deps.log ?? ((msg: string, extra?: Record<string, unknown>) => console.warn(`[gaitway] ${msg}`, extra ?? ""));
}
