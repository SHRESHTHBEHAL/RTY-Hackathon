import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { usdcAbi, vaultAbi } from "./abi.js";
import { deriveTestAddress, toChainKey } from "./keys.js";
import type { DepositEvent, Hex, SettleItem, VaultClient, VaultClientConfig } from "./types.js";

/** Extra knobs that are not part of the shared contract. Used by tests. */
export type VaultClientOptions = {
  /** Replace the HTTP transport (for example to inject faults in tests). */
  transport?: Transport;
  /** Attempts for a write that fails with a transient RPC error. Default 3. */
  maxAttempts?: number;
  /** Delay between write attempts in ms. Default 250. */
  retryDelayMs?: number;
  /** Block range per getLogs request. Default 2000. */
  logPageSize?: bigint;
};

/** Thrown when a contract call reverts. `errorName` is the Solidity error, if decoded. */
export class VaultRevertError extends Error {
  constructor(message: string, readonly errorName: string | undefined, readonly cause?: unknown) {
    super(message);
    this.name = "VaultRevertError";
  }
}

function revertName(err: unknown): string | undefined | null {
  if (!(err instanceof BaseError)) return null;
  const rev = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (rev instanceof ContractFunctionRevertedError) return rev.data?.errorName ?? rev.reason ?? undefined;
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createVaultClient(config: VaultClientConfig, options: VaultClientOptions = {}): VaultClient {
  const chain = defineChain({
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const transport = options.transport ?? http(config.rpcUrl);
  const account = privateKeyToAccount(config.adminPrivateKey);
  const pub = createPublicClient({ chain, transport, pollingInterval: 250 });
  const wallet = createWalletClient({ chain, transport, account });
  const confirmations = Math.max(1, config.confirmations);
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const pageSize = options.logPageSize ?? 2000n;

  // One queue for every write, so nonces never collide.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Simulate (a revert throws VaultRevertError and is never retried), then send with a
   * fixed nonce, retrying transient RPC failures with that same nonce, then wait for
   * `confirmations` blocks.
   */
  function write(address: Hex, abi: Abi, functionName: string, args: readonly unknown[]): Promise<Hex> {
    return enqueue(async () => {
      let request;
      try {
        ({ request } = await pub.simulateContract({ address, abi, functionName, args, account } as never));
      } catch (err) {
        const name = revertName(err);
        if (name !== null) {
          throw new VaultRevertError(
            `${functionName} reverted: ${name ?? "unknown reason"}`,
            name ?? undefined,
            err,
          );
        }
        throw err;
      }
      const nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
      let hash: Hex | undefined;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          hash = await wallet.writeContract({ ...(request as object), nonce } as never);
          break;
        } catch (err) {
          lastErr = err;
          if (revertName(err) !== null) throw err;
          const msg = err instanceof Error ? err.message.toLowerCase() : "";
          // The node already has our transaction: treat as sent, find it by nonce below.
          if (msg.includes("already known") || msg.includes("nonce too low")) break;
          if (attempt < maxAttempts) await sleep(retryDelayMs);
        }
      }
      if (!hash) {
        // Either all attempts failed, or the node reported the tx as already known.
        const latestNonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
        if (latestNonce <= nonce) throw lastErr;
        throw new Error(
          `${functionName}: transaction with nonce ${nonce} was accepted but its hash is unknown; ` +
            `check usedKey before retrying`,
        );
      }
      const receipt = await pub.waitForTransactionReceipt({ hash, confirmations, pollingInterval: 250 });
      if (receipt.status !== "success") throw new VaultRevertError(`${functionName} reverted on-chain`, undefined);
      return hash;
    });
  }

  const vault = config.vaultAddress;
  const usdc = config.usdcAddress;

  function needMnemonic(): string {
    if (!config.testAddressMnemonic) {
      throw new Error("No address given and no testAddressMnemonic configured");
    }
    return config.testAddressMnemonic;
  }

  async function isUsed(key: Hex): Promise<boolean> {
    return (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "usedKey", args: [key] })) as boolean;
  }

  async function getConfirmedBlock(): Promise<bigint> {
    const head = await pub.getBlockNumber({ cacheTime: 0 });
    // A tx in the head block has 1 confirmation, so "final" = head - (confirmations - 1).
    const confirmed = head - BigInt(confirmations - 1);
    return confirmed < 0n ? 0n : confirmed;
  }

  /** Runs a keyed, idempotent write. */
  async function keyedWrite(key: Hex, send: () => Promise<Hex>): Promise<{ txHash: Hex | null; alreadyDone: boolean }> {
    if (await isUsed(key)) return { txHash: null, alreadyDone: true };
    try {
      return { txHash: await send(), alreadyDone: false };
    } catch (err) {
      if (err instanceof VaultRevertError && err.errorName === "KeyAlreadyUsed") {
        return { txHash: null, alreadyDone: true };
      }
      throw err;
    }
  }

  return {
    async registerBusiness(businessId, withdrawAddress) {
      const key = toChainKey(businessId);
      const addr = withdrawAddress ?? deriveTestAddress(needMnemonic(), key);
      const txHash = await write(vault, vaultAbi, "registerBusiness", [key, addr]);
      return { withdrawAddress: addr, txHash };
    },

    async registerSeller(sellerId, payoutAddress) {
      const key = toChainKey(sellerId);
      const addr = payoutAddress ?? deriveTestAddress(needMnemonic(), key);
      const txHash = await write(vault, vaultAbi, "registerSeller", [key, addr]);
      return { payoutAddress: addr, txHash };
    },

    async testDeposit(businessId, amountMicros) {
      if (amountMicros <= 0n) throw new Error("amountMicros must be positive");
      const key = toChainKey(businessId);
      await write(usdc, usdcAbi, "mint", [account.address, amountMicros]);
      await write(usdc, usdcAbi, "approve", [vault, amountMicros]);
      const txHash = await write(vault, vaultAbi, "deposit", [key, amountMicros]);
      return { txHash };
    },

    async settle(batchId, items: SettleItem[]) {
      const key = toChainKey(batchId);
      if (items.length === 0) {
        return { txHash: null, alreadyDone: await isUsed(key) };
      }
      const chainItems = items.map((i) => ({
        businessKey: toChainKey(i.businessId),
        sellerKey: toChainKey(i.sellerId),
        gross: i.grossMicros,
        fee: i.feeMicros,
      }));
      return keyedWrite(key, () => write(vault, vaultAbi, "settle", [key, chainItems]));
    },

    async withdraw(withdrawalId, businessId, amountMicros) {
      const key = toChainKey(withdrawalId);
      const biz = toChainKey(businessId);
      return keyedWrite(key, () => write(vault, vaultAbi, "withdraw", [key, biz, amountMicros]));
    },

    async getBusinessBalance(businessId) {
      return (await pub.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "balanceOf",
        args: [toChainKey(businessId)],
      })) as bigint;
    },

    async getFeeBalance() {
      return (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "feeBalance" })) as bigint;
    },

    getConfirmedBlock,

    async getDeposits(fromBlock, toBlock) {
      // Never report anything above the confirmed block (reorg safety).
      const confirmed = await getConfirmedBlock();
      const end = toBlock < confirmed ? toBlock : confirmed;
      if (fromBlock > end) return [];
      const out: DepositEvent[] = [];
      for (let start = fromBlock; start <= end; start += pageSize) {
        const stop = start + pageSize - 1n < end ? start + pageSize - 1n : end;
        const logs = await pub.getContractEvents({
          address: vault,
          abi: vaultAbi,
          eventName: "Deposited",
          fromBlock: start,
          toBlock: stop,
        });
        for (const log of logs) {
          const args = log.args as { businessKey: Hex; amount: bigint };
          out.push({
            businessKey: args.businessKey,
            amountMicros: args.amount,
            txHash: log.transactionHash as Hex,
            logIndex: Number(log.logIndex),
            blockNumber: log.blockNumber as bigint,
          });
        }
      }
      out.sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
      );
      return out;
    },
  };
}
