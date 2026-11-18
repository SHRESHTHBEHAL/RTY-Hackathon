import { describe, expect, it } from "vitest";
import { setup } from "../helpers.js";
import { fundedBusiness } from "../fixtures.js";
import { runWithdrawalJob } from "../../src/jobs/withdrawals.js";
import { runReconcile } from "../../src/jobs/reconcile.js";
import type { MemoryVault } from "../../src/vault/memory.js";

describe("withdrawals", () => {
  it("moves unallocated out through the vault; refuses overdraft", async () => {
    const ctx = await setup();
    const b = await fundedBusiness(ctx, "b@x.test", 10);
    const r = await ctx.call("POST", "/v1/withdrawals", { token: b.apiKey, body: { amountMicros: "4000000" } });
    expect(r.status).toBe(200);
    expect(r.body.withdrawal).toMatchObject({ amountMicros: "4000000", status: "sent" });
    expect(r.body.withdrawal.id).toMatch(/^wdr_/);
    expect(r.body.withdrawal.txHash).toMatch(/^0x/);
    expect((await ctx.call("GET", "/v1/balance", { token: b.apiKey })).body.unallocatedMicros).toBe("6000000");
    expect(await ctx.vault.getBusinessBalance(b.account.businessId)).toBe(6_000_000n);
    expect((await ctx.call("GET", "/v1/withdrawals", { token: b.apiKey })).body.data).toHaveLength(1);
    const over = await ctx.call("POST", "/v1/withdrawals", { token: b.apiKey, body: { amountMicros: "6000001" } });
    expect(over.body.error.code).toBe("insufficient_funds");
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
    const tx = (await ctx.call("GET", "/v1/transactions", { token: b.apiKey })).body.data;
    expect(tx[0]).toMatchObject({ type: "withdrawal", amountMicros: "-4000000" });
  });

  it("crash after the vault call completes once on retry; reconcile ok throughout", async () => {
    const ctx = await setup();
    const b = await fundedBusiness(ctx, "b@x.test", 10);
    let crash = true;
    ctx.deps.hooks = {
      afterVaultWithdraw: () => {
        if (crash) throw new Error("died");
      },
    };
    const r = await ctx.call("POST", "/v1/withdrawals", { token: b.apiKey, body: { amountMicros: "1000000" } });
    expect(r.status).toBe(200);
    expect(r.body.withdrawal.status).toBe("pending");
    crash = false;
    expect(await runWithdrawalJob(ctx.deps)).toBe(1);
    const list = (await ctx.call("GET", "/v1/withdrawals", { token: b.apiKey })).body.data;
    expect(list[0].status).toBe("sent");
    expect((ctx.vault as MemoryVault).executedKeys).toEqual([r.body.withdrawal.id]);
    expect(await ctx.vault.getBusinessBalance(b.account.businessId)).toBe(9_000_000n);
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
  });
});
