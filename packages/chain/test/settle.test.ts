import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, http, type Hex } from "viem";
import { createVaultClient, toChainKey, usdcAbi, type VaultClient } from "../src/index.js";
import { startChain, type TestChain } from "./anvil.js";

let chain: TestChain;
let client: VaultClient;
const sellerPayout: Hex = "0x00000000000000000000000000000000000000A1";

async function tokenBalance(addr: Hex): Promise<bigint> {
  const pub = createPublicClient({ transport: http(chain.rpcUrl) });
  return pub.readContract({ address: chain.config.usdcAddress, abi: usdcAbi, functionName: "balanceOf", args: [addr] });
}

beforeAll(async () => {
  chain = await startChain();
  client = createVaultClient(chain.config);
  await client.registerBusiness("biz_a");
  await client.registerSeller("sel_a", sellerPayout);
}, 60_000);

afterAll(() => chain?.stop());

describe("deposits feed", () => {
  it("reports confirmed deposits in order", async () => {
    const t1 = await client.testDeposit("biz_a", 30_000_000n);
    const t2 = await client.testDeposit("biz_a", 20_000_000n);
    const deps = await client.getDeposits(0n, await client.getConfirmedBlock());
    expect(deps).toHaveLength(2);
    expect(deps.map((d) => d.txHash)).toEqual([t1.txHash, t2.txHash]);
    expect(deps.map((d) => d.amountMicros)).toEqual([30_000_000n, 20_000_000n]);
    expect(deps[0]!.businessKey).toBe(toChainKey("biz_a"));
    expect(typeof deps[0]!.logIndex).toBe("number");
    expect(deps[0]!.blockNumber < deps[1]!.blockNumber).toBe(true);
  });

  it("with confirmations 3, a head-block deposit appears only after two more blocks", async () => {
    const slow = createVaultClient({ ...chain.config, confirmations: 3 });
    const { txHash } = await client.testDeposit("biz_a", 1_000_000n);
    const seen = async () =>
      (await slow.getDeposits(0n, 10n ** 9n)).some((d) => d.txHash === txHash);
    expect(await seen()).toBe(false);
    await chain.test.mine({ blocks: 1 });
    expect(await seen()).toBe(false);
    await chain.test.mine({ blocks: 1 });
    expect(await seen()).toBe(true);
  });

  it("returns [] when fromBlock > toBlock", async () => {
    expect(await client.getDeposits(10n, 5n)).toEqual([]);
  });

  it("pages getLogs across small windows", async () => {
    const paged = createVaultClient(chain.config, { logPageSize: 2n });
    const all = await client.getDeposits(0n, await client.getConfirmedBlock());
    expect(await paged.getDeposits(0n, await client.getConfirmedBlock())).toEqual(all);
  });
});

describe("settle and withdraw", () => {
  const item = { businessId: "biz_a", sellerId: "sel_a", grossMicros: 10_000_000n, feeMicros: 100_000n };

  it("settles once", async () => {
    const r = await client.settle("stl_1", [item]);
    expect(r.alreadyDone).toBe(false);
    expect(r.txHash).toMatch(/^0x/);
    expect(await tokenBalance(sellerPayout)).toBe(9_900_000n);
    expect(await client.getFeeBalance()).toBe(100_000n);
  });

  it("a repeated batch is a no-op", async () => {
    const before = await client.getBusinessBalance("biz_a");
    expect(await client.settle("stl_1", [item])).toEqual({ txHash: null, alreadyDone: true });
    expect(await client.getBusinessBalance("biz_a")).toBe(before);
    expect(await tokenBalance(sellerPayout)).toBe(9_900_000n);
  });

  it("an overdrawing batch rejects with InsufficientBalance", async () => {
    await expect(client.settle("stl_big", [{ ...item, grossMicros: 10n ** 15n }])).rejects.toThrow(
      /InsufficientBalance/,
    );
  });

  it("an empty batch sends nothing", async () => {
    const pub = createPublicClient({ transport: http(chain.rpcUrl) });
    const before = await pub.getBlockNumber({ cacheTime: 0 });
    expect(await client.settle("stl_2", [])).toEqual({ txHash: null, alreadyDone: false });
    expect(await pub.getBlockNumber({ cacheTime: 0 })).toBe(before);
  });

  it("withdraws once", async () => {
    const before = await client.getBusinessBalance("biz_a");
    const r = await client.withdraw("wdr_1", "biz_a", 5_000_000n);
    expect(r.alreadyDone).toBe(false);
    expect(await client.getBusinessBalance("biz_a")).toBe(before - 5_000_000n);
    expect(await client.withdraw("wdr_1", "biz_a", 5_000_000n)).toEqual({ txHash: null, alreadyDone: true });
    expect(await client.getBusinessBalance("biz_a")).toBe(before - 5_000_000n);
  });
});
