// Verbatim from context.md section 9 ("TypeScript client (@gaitway/chain)").
// Core must not import @gaitway/chain; the real client is plugged in at
// integration (context.md section 12) through src/vault/index.ts.

export type Hex = `0x${string}`;

export type SettleItem = {
  businessId: string; sellerId: string; grossMicros: bigint; feeMicros: bigint };

export type DepositEvent = {
  businessKey: Hex; amountMicros: bigint; txHash: Hex; logIndex: number; blockNumber: bigint };

export interface VaultClient {
  registerBusiness(businessId: string, withdrawAddress?: Hex):
    Promise<{ withdrawAddress: Hex; txHash: Hex }>;
  registerSeller(sellerId: string, payoutAddress?: Hex):
    Promise<{ payoutAddress: Hex; txHash: Hex }>;
  /** Test environment only. Mints MockUSDC and deposits it for the business. */
  testDeposit(businessId: string, amountMicros: bigint): Promise<{ txHash: Hex }>;
  /** Idempotent: if batchId was already settled, resolves with alreadyDone true. */
  settle(batchId: string, items: SettleItem[]):
    Promise<{ txHash: Hex | null; alreadyDone: boolean }>;
  /** Idempotent in the same way, keyed by withdrawalId. */
  withdraw(withdrawalId: string, businessId: string, amountMicros: bigint):
    Promise<{ txHash: Hex | null; alreadyDone: boolean }>;
  getBusinessBalance(businessId: string): Promise<bigint>;
  getFeeBalance(): Promise<bigint>;
  /** Highest block considered final: head minus the confirmation count. */
  getConfirmedBlock(): Promise<bigint>;
  /** Deposits in [fromBlock, toBlock], both inclusive, ordered. */
  getDeposits(fromBlock: bigint, toBlock: bigint): Promise<DepositEvent[]>;
}

export type VaultClientConfig = {
  rpcUrl: string; chainId: number; vaultAddress: Hex; usdcAddress: Hex;
  adminPrivateKey: Hex;      // holds all three roles in test
  confirmations: number;     // 1 on anvil, 3 on Base Sepolia
  testAddressMnemonic?: string; // derives addresses when none is supplied
};
