import type { Config } from "../config.js";
import type { VaultClient } from "./types.js";
import { createMemoryVault } from "./memory.js";
import { createChainVault } from "./chain.js";

export type { VaultClient } from "./types.js";

/**
 * Chooses the vault by VAULT_DRIVER: the in-process stand-in ("memory") or
 * the real contract through @gaitway/chain ("chain", see ./chain.ts).
 */
export async function getVault(config: Config): Promise<VaultClient> {
  if (config.vaultDriver === "memory") {
    return createMemoryVault({ confirmations: config.confirmations, autoMine: true });
  }
  return createChainVault(config);
}
