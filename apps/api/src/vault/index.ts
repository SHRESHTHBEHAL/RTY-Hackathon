import type { Config } from "../config.js";
import type { VaultClient } from "./types.js";
import { createMemoryVault } from "./memory.js";

export type { VaultClient } from "./types.js";

/**
 * Chooses the vault by VAULT_DRIVER. The chain driver is wired at integration
 * time (context.md section 12): add `@gaitway/chain`, create
 * src/vault/chain.ts, and return its client here.
 */
export function getVault(config: Config): VaultClient {
  if (config.vaultDriver === "memory") {
    return createMemoryVault({ confirmations: config.confirmations, autoMine: true });
  }
  throw new Error("VAULT_DRIVER=chain is not wired; see context.md section 12");
}
