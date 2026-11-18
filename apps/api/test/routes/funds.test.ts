import { describe, expect, it } from "vitest";
import { setup } from "../helpers.js";
import { confirmDeposits, createAgent, signup, usd } from "../fixtures.js";
import { runDepositJob } from "../../src/jobs/deposits.js";
import type { MemoryVault } from "../../src/vault/memory.js";

describe("top-ups, deposits, allocations", () => {
  it("registers businesses and sellers on the vault; stores payout address", async () => {
    const ctx = await setup();
    const b = await signup(ctx, "b@x.test");
    const s = await signup(ctx, "s@x.test", "seller");
    expect(await ctx.vault.getBusinessBalance(b.account.businessId)).toBe(0n);
    const [row] = await ctx.sql`select payout_address from sellers where id = ${s.account.sellerId}`;
    expect(row!.payout_address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("test top-up is pending until the deposit job credits it, exactly once", async () => {
    const ctx = await setup();
    const b = await signup(ctx, "b@x.test");
    const t = await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: "100000000", method: "test" } });
    expect(t.status).toBe(200);
    expect(t.body.topup).toMatchObject({ amountMicros: "100000000", method: "test", status: "pending", txHash: null });
    expect(t.body.topup.id).toMatch(/^top_/);
    let bal = await ctx.call("GET", "/v1/balance", { token: b.apiKey });
    expect(bal.body).toEqual({ unallocatedMicros: "0", wallets: [] });

    expect(await runDepositJob(ctx.deps)).toBe(0); // not yet confirmed
    expect(await confirmDeposits(ctx)).toBe(1);
    const list = await ctx.call("GET", "/v1/topups", { token: b.apiKey });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: t.body.topup.id, status: "confirmed" });
    expect(list.body.data[0].txHash).toMatch(/^0x/);
    bal = await ctx.call("GET", "/v1/balance", { token: b.apiKey });
    expect(bal.body.unallocatedMicros).toBe("100000000");

    await ctx.sql`delete from chain_cursor`; // force a re-scan
    expect(await runDepositJob(ctx.deps)).toBe(0);
    bal = await ctx.call("GET", "/v1/balance", { token: b.apiKey });
    expect(bal.body.unallocatedMicros).toBe("100000000");
  });

  it("skips deposits for unknown businesses; ramp is refused in M1", async () => {
    const ctx = await setup();
    const v = ctx.vault as MemoryVault;
    await v.registerBusiness("biz_unknown000000000000000000");
    await v.testDeposit("biz_unknown000000000000000000", 5n);
    v.mineBlocks(1);
    const logs: string[] = [];
    ctx.deps.log = (m) => logs.push(m);
    expect(await runDepositJob(ctx.deps)).toBe(0);
    expect(logs.join(" ")).toContain("unknown business");
    const b = await signup(ctx, "b@x.test");
    const r = await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: "1", method: "ramp" } });
    expect(r.body.error.code).toBe("validation_failed");
    const r2 = await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: "-1", method: "test" } });
    expect(r2.body.error.code).toBe("validation_failed");
  });

  it("allocates both ways, refuses overdraft and foreign wallets; lists transactions", async () => {
    const ctx = await setup();
    const b = await signup(ctx, "b@x.test");
    await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: usd(100), method: "test" } });
    await confirmDeposits(ctx);
    const a = await createAgent(ctx, b.apiKey);
    const w = a.agent.walletId;
    const r = await ctx.call("POST", "/v1/allocations", { token: b.apiKey, body: { walletId: w, amountMicros: "30000000", direction: "to_wallet" } });
    expect(r.status).toBe(200);
    expect(r.body.unallocatedMicros).toBe("70000000");
    expect(r.body.wallet).toMatchObject({ walletId: w, availableMicros: "30000000", heldMicros: "0" });
    const back = await ctx.call("POST", "/v1/allocations", { token: b.apiKey, body: { walletId: w, amountMicros: "30000000", direction: "to_unallocated" } });
    expect(back.body.unallocatedMicros).toBe("100000000");
    expect(back.body.wallet.availableMicros).toBe("0");

    const over = await ctx.call("POST", "/v1/allocations", { token: b.apiKey, body: { walletId: w, amountMicros: usd(101), direction: "to_wallet" } });
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe("insufficient_funds");

    const other = await signup(ctx, "o@x.test");
    const oa = await createAgent(ctx, other.apiKey);
    const foreign = await ctx.call("POST", "/v1/allocations", { token: b.apiKey, body: { walletId: oa.agent.walletId, amountMicros: "1", direction: "to_wallet" } });
    expect(foreign.status).toBe(404);

    const tx = await ctx.call("GET", "/v1/transactions", { token: b.apiKey });
    expect(tx.body.data.map((t: any) => [t.type, t.amountMicros, t.walletId])).toEqual([
      ["allocation", "-30000000", w],
      ["allocation", "30000000", w],
      ["topup", "100000000", null],
    ]);
    const filtered = await ctx.call("GET", `/v1/transactions?walletId=${w}`, { token: b.apiKey });
    expect(filtered.body.data).toHaveLength(2);
    const paged = await ctx.call("GET", "/v1/transactions?limit=2", { token: b.apiKey });
    expect(paged.body.data).toHaveLength(2);
    const p2 = await ctx.call("GET", `/v1/transactions?limit=2&cursor=${paged.body.nextCursor}`, { token: b.apiKey });
    expect(p2.body.data.map((t: any) => t.type)).toEqual(["topup"]);
    expect(p2.body.nextCursor).toBeNull();
  });
});
