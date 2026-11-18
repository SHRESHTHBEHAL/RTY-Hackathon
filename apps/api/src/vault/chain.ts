import type { Config } from "../config.js";
import type { Hex, VaultClient, VaultClientConfig } from "./types.js";

/**
 * Builds the real vault client from @gaitway/chain (context.md section 12).
 *
 * The package is loaded at runtime only when VAULT_DRIVER=chain, so apps/api
 * still installs, builds and tests without packages/chain present. To enable
 * it at integration: add "@gaitway/chain": "workspace:*" to
 * apps/api/package.json, build packages/chain, and run pnpm install.
 */
export async function createChainVault(config: Config): Promise<VaultClient> {
  const missing = Object.entries({
    VAULT_ADDRESS: config.vaultAddress,
    USDC_ADDRESS: config.usdcAddress,
    ADMIN_PRIVATE_KEY: config.adminPrivateKey,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`VAULT_DRIVER=chain needs ${missing.join(", ")} (printed by: pnpm --filter @gaitway/chain chain:dev)`);
  }
  const pkg = "@gaitway/chain";
  let mod: { createVaultClient(c: VaultClientConfig): VaultClient };
  try {
    mod = (await import(pkg)) as typeof mod;
  } catch (e) {
    throw new Error(
      `VAULT_DRIVER=chain needs the @gaitway/chain package: add "@gaitway/chain": "workspace:*" to apps/api/package.json, ` +
        `run pnpm --filter @gaitway/chain build and pnpm install (context.md section 12). Cause: ${(e as Error).message}`,
    );
  }
  return mod.createVaultClient({
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    vaultAddress: config.vaultAddress as Hex,
    usdcAddress: config.usdcAddress as Hex,
    adminPrivateKey: config.adminPrivateKey as Hex,
    confirmations: config.confirmations,
    testAddressMnemonic: config.testAddressMnemonic,
  });
}
