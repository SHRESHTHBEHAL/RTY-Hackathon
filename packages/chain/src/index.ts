export type { Hex, SettleItem, DepositEvent, VaultClient, VaultClientConfig } from "./types.js";
export { toChainKey, deriveTestAddress, derivationIndex } from "./keys.js";
export { createVaultClient, VaultRevertError, type VaultClientOptions } from "./client.js";
export { vaultAbi, usdcAbi } from "./abi.js";
