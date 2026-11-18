import { randomBase36 } from "../ids.js";
import type { VaultClient } from "../vault/types.js";
import type { RampProvider } from "./types.js";

/**
 * SIMULATION ONLY. Pretends a currency partner took the business's money and
 * deposited the same amount of USDC into the vault. It uses the vault's test
 * deposit, so the top-up confirms through the normal deposit job. No real
 * money moves.
 */
export function createSimulatedRamp(vault: VaultClient): RampProvider {
  return {
    async createTopup(businessId, amountMicros) {
      await vault.testDeposit(businessId, amountMicros);
      return { providerRef: `simramp_${randomBase36(16)}`, checkoutUrl: null };
    },
    async createPayout() {
      return { providerRef: `simramp_${randomBase36(16)}` };
    },
  };
}
