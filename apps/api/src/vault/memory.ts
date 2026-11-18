import { randomBytes } from "node:crypto";
import type { DepositEvent, Hex, SettleItem, VaultClient } from "./types.js";
import { toChainKey } from "./chainkey.js";

const randHash = (): Hex => `0x${randomBytes(32).toString("hex")}`;
const addressFor = (id: string): Hex => `0x${toChainKey(id).slice(-40)}`;

export type MemoryVault = VaultClient & {
  /** Advances the chain head by n blocks. */
  mineBlocks(n: number): void;
  /** Test hook: overwrite a business balance directly (breaks reconciliation). */
  setBusinessBalance(businessId: string, amountMicros: bigint): void;
  /** USDC received so far by a seller's payout address. */
  paidTo(sellerId: string): bigint;
  /** Number of settle/withdraw calls that actually moved money. */
  readonly executedKeys: string[];
};

/**
 * In-process stand-in for the vault contract, following the rules in
 * context.md section 9. State lives only as long as the process.
 * With autoMine, every getConfirmedBlock call mines a block, so deposits
 * confirm on their own in development.
 */
export function createMemoryVault(opts: { confirmations?: number; autoMine?: boolean } = {}): MemoryVault {
  const confirmations = BigInt(opts.confirmations ?? 1);
  let head = 0n;
  const businesses = new Map<string, { balance: bigint; withdrawAddress: Hex }>();
  const sellers = new Map<string, Hex>();
  const received = new Map<string, bigint>();
  const deposits: DepositEvent[] = [];
  const used = new Set<string>();
  const executedKeys: string[] = [];
  let feeBalance = 0n;

  return {
    executedKeys,
    async registerBusiness(businessId, withdrawAddress) {
      const addr = withdrawAddress ?? addressFor(businessId);
      const existing = businesses.get(businessId);
      businesses.set(businessId, { balance: existing?.balance ?? 0n, withdrawAddress: addr });
      head += 1n;
      return { withdrawAddress: addr, txHash: randHash() };
    },
    async registerSeller(sellerId, payoutAddress) {
      const addr = payoutAddress ?? addressFor(sellerId);
      sellers.set(sellerId, addr);
      head += 1n;
      return { payoutAddress: addr, txHash: randHash() };
    },
    async testDeposit(businessId, amountMicros) {
      const b = businesses.get(businessId);
      if (!b) throw new Error("vault: deposit for unregistered business");
      if (amountMicros <= 0n) throw new Error("vault: amount must be positive");
      head += 1n;
      const txHash = randHash();
      b.balance += amountMicros;
      deposits.push({ businessKey: toChainKey(businessId), amountMicros, txHash, logIndex: 0, blockNumber: head });
      return { txHash };
    },
    async settle(batchId: string, items: SettleItem[]) {
      const key = toChainKey(batchId);
      if (used.has(key)) return { txHash: null, alreadyDone: true };
      const next = new Map<string, bigint>();
      for (const it of items) {
        const b = businesses.get(it.businessId);
        if (!b) throw new Error(`vault: unregistered business ${it.businessId}`);
        if (!sellers.has(it.sellerId)) throw new Error(`vault: unregistered seller ${it.sellerId}`);
        if (it.feeMicros < 0n || it.grossMicros < 0n || it.feeMicros > it.grossMicros) throw new Error("vault: bad item");
        const bal = (next.get(it.businessId) ?? b.balance) - it.grossMicros;
        if (bal < 0n) throw new Error(`vault: business ${it.businessId} balance would go negative`);
        next.set(it.businessId, bal);
      }
      for (const [id, bal] of next) businesses.get(id)!.balance = bal;
      for (const it of items) {
        received.set(it.sellerId, (received.get(it.sellerId) ?? 0n) + it.grossMicros - it.feeMicros);
        feeBalance += it.feeMicros;
      }
      used.add(key);
      executedKeys.push(batchId);
      head += 1n;
      return { txHash: randHash(), alreadyDone: false };
    },
    async withdraw(withdrawalId, businessId, amountMicros) {
      const key = toChainKey(withdrawalId);
      if (used.has(key)) return { txHash: null, alreadyDone: true };
      const b = businesses.get(businessId);
      if (!b) throw new Error("vault: unregistered business");
      if (b.balance < amountMicros) throw new Error("vault: insufficient balance");
      b.balance -= amountMicros;
      used.add(key);
      executedKeys.push(withdrawalId);
      head += 1n;
      return { txHash: randHash(), alreadyDone: false };
    },
    async getBusinessBalance(businessId) {
      return businesses.get(businessId)?.balance ?? 0n;
    },
    async getFeeBalance() {
      return feeBalance;
    },
    async getConfirmedBlock() {
      if (opts.autoMine) head += 1n;
      const c = head - confirmations;
      return c < 0n ? 0n : c;
    },
    async getDeposits(fromBlock, toBlock) {
      return deposits.filter((d) => d.blockNumber >= fromBlock && d.blockNumber <= toBlock);
    },
    mineBlocks(n: number) {
      head += BigInt(n);
    },
    setBusinessBalance(businessId, amountMicros) {
      const b = businesses.get(businessId);
      if (!b) throw new Error("vault: unregistered business");
      b.balance = amountMicros;
    },
    paidTo(sellerId) {
      return received.get(sellerId) ?? 0n;
    },
  };
}
