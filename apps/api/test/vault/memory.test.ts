import { describe, expect, it } from "vitest";
import { createMemoryVault } from "../../src/vault/memory.js";

describe("memory vault", () => {
  it("testDeposit raises balance; deposits appear once confirmed", async () => {
    const v = createMemoryVault({ confirmations: 1 });
    await v.registerBusiness("biz_1");
    await v.testDeposit("biz_1", 500n);
    expect(await v.getBusinessBalance("biz_1")).toBe(500n);
    expect(await v.getDeposits(0n, await v.getConfirmedBlock())).toHaveLength(0);
    v.mineBlocks(1);
    const deps = await v.getDeposits(0n, await v.getConfirmedBlock());
    expect(deps).toHaveLength(1);
    expect(deps[0]!.amountMicros).toBe(500n);
  });

  it("settle is idempotent per batch and rejects overdraws atomically", async () => {
    const v = createMemoryVault();
    await v.registerBusiness("biz_1");
    await v.registerSeller("sel_1");
    await v.testDeposit("biz_1", 100n);
    const a = await v.settle("stl_1", [{ businessId: "biz_1", sellerId: "sel_1", grossMicros: 60n, feeMicros: 1n }]);
    expect(a.alreadyDone).toBe(false);
    const b = await v.settle("stl_1", [{ businessId: "biz_1", sellerId: "sel_1", grossMicros: 60n, feeMicros: 1n }]);
    expect(b).toEqual({ txHash: null, alreadyDone: true });
    expect(await v.getBusinessBalance("biz_1")).toBe(40n);
    expect(v.paidTo("sel_1")).toBe(59n);
    expect(await v.getFeeBalance()).toBe(1n);
    await expect(
      v.settle("stl_2", [
        { businessId: "biz_1", sellerId: "sel_1", grossMicros: 30n, feeMicros: 0n },
        { businessId: "biz_1", sellerId: "sel_1", grossMicros: 30n, feeMicros: 0n },
      ]),
    ).rejects.toThrow();
    expect(await v.getBusinessBalance("biz_1")).toBe(40n);
  });
});
