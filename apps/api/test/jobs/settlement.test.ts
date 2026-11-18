import { describe, expect, it } from "vitest";
import { setup, type Ctx } from "../helpers.js";
import { allocate, createAgent, fundedBusiness, signup } from "../fixtures.js";
import { runSettlement } from "../../src/jobs/settlement.js";
import { runReconcile } from "../../src/jobs/reconcile.js";
import { balanceOf } from "../../src/ledger/ledger.js";
import type { MemoryVault } from "../../src/vault/memory.js";
import type { SettleItem } from "../../src/vault/types.js";

let k = 0;
async function pay(ctx: Ctx, agentKey: string, sellerKey: string, sellerId: string, amount: string) {
  const c = await ctx.call("POST", "/v1/credentials", { token: agentKey, body: { sellerId, maxMicros: amount } });
  const r = await ctx.call("POST", "/v1/charges", {
    token: sellerKey,
    body: { credentialId: c.body.credential.id, amountMicros: amount },
    headers: { "idempotency-key": `s${++k}` },
  });
  if (r.status !== 200) throw new Error(r.text);
  return r.body.charge;
}

/** Two businesses (one agent each, 10 dollars) and two sellers; four charges. */
async function scene(ctx: Ctx) {
  const b1 = await fundedBusiness(ctx, "b1@x.test", 20);
  const b2 = await fundedBusiness(ctx, "b2@x.test", 20);
  const a1 = await createAgent(ctx, b1.apiKey);
  const a2 = await createAgent(ctx, b2.apiKey);
  await allocate(ctx, b1.apiKey, a1.agent.walletId, 10);
  await allocate(ctx, b2.apiKey, a2.agent.walletId, 10);
  const s1 = await signup(ctx, "s1@x.test", "seller");
  const s2 = await signup(ctx, "s2@x.test", "seller");
  await pay(ctx, a1.apiKey, s1.apiKey, s1.account.sellerId, "100000");
  await pay(ctx, a1.apiKey, s1.apiKey, s1.account.sellerId, "200000");
  await pay(ctx, a1.apiKey, s2.apiKey, s2.account.sellerId, "50000");
  await pay(ctx, a2.apiKey, s2.apiKey, s2.account.sellerId, "400000");
  return { b1, b2, a1, a2, s1, s2 };
}

function spyVault(ctx: Ctx) {
  const calls: { batchId: string; items: SettleItem[] }[] = [];
  const orig = ctx.vault.settle.bind(ctx.vault);
  ctx.vault.settle = async (batchId, items) => {
    calls.push({ batchId, items });
    return orig(batchId, items);
  };
  return calls;
}

describe("settlement", () => {
  it("settles one batch per run with one item per business-seller pair", async () => {
    const ctx = await setup({ feeBps: 100 });
    const s = await scene(ctx);
    const calls = spyVault(ctx);
    const r = await runSettlement(ctx.deps);
    expect(r.batchId).toMatch(/^stl_/);
    expect(calls).toHaveLength(1);
    const items = calls[0]!.items.map((i) => [i.businessId, i.sellerId, i.grossMicros, i.feeMicros]);
    const b1 = s.b1.account.businessId, b2 = s.b2.account.businessId;
    const s1 = s.s1.account.sellerId, s2 = s.s2.account.sellerId;
    expect(items).toHaveLength(3);
    expect(items).toEqual(
      expect.arrayContaining([
        [b1, s1, 300000n, 3000n],
        [b1, s2, 50000n, 500n],
        [b2, s2, 400000n, 4000n],
      ]),
    );
    for (const sel of [s.s1, s.s2]) {
      const bal = await ctx.call("GET", "/v1/seller/balance", { token: sel.apiKey });
      expect(bal.body.owedMicros).toBe("0");
    }
    const p1 = await ctx.call("GET", "/v1/payouts", { token: s.s1.apiKey });
    expect(p1.body.data).toHaveLength(1);
    expect(p1.body.data[0]).toMatchObject({ sellerId: s1, amountMicros: "297000", status: "sent" });
    expect(p1.body.data[0].txHash).toMatch(/^0x/);
    expect(p1.body.data[0].id).toMatch(/^pay_/);
    expect((await ctx.call("GET", "/v1/seller/balance", { token: s.s2.apiKey })).body.paidOutMicros).toBe("445500");
    expect((ctx.vault as MemoryVault).paidTo(s1)).toBe(297000n);
    const [{ n }] = await ctx.sql`select count(*)::int as n from charges where settled_at is null`;
    expect(n).toBe(0);
    expect(await balanceOf(ctx.sql, "test", "fees", "gaitway")).toBe(0n);
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
  });

  it("does nothing without unsettled charges", async () => {
    const ctx = await setup();
    const calls = spyVault(ctx);
    expect(await runSettlement(ctx.deps)).toEqual({ batchId: null });
    expect(calls).toHaveLength(0);
  });

  it("crash after the vault call: next run reuses the batch and completes once", async () => {
    const ctx = await setup();
    const s = await scene(ctx);
    const calls = spyVault(ctx);
    let crash = true;
    ctx.deps.hooks = {
      afterVaultSettle: () => {
        if (crash) throw new Error("process died");
      },
    };
    await expect(runSettlement(ctx.deps)).rejects.toThrow("process died");
    const before = await ctx.vault.getBusinessBalance(s.b1.account.businessId);
    crash = false;
    const r = await runSettlement(ctx.deps);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.batchId).toBe(calls[0]!.batchId);
    expect(r.batchId).toBe(calls[0]!.batchId);
    expect((ctx.vault as MemoryVault).executedKeys).toEqual([calls[0]!.batchId]);
    expect(await ctx.vault.getBusinessBalance(s.b1.account.businessId)).toBe(before);
    expect(await ctx.vault.getBusinessBalance(s.b1.account.businessId)).toBe(20_000_000n - 350_000n);
    const p = await ctx.call("GET", "/v1/payouts", { token: s.s1.apiKey });
    expect(p.body.data).toHaveLength(1);
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
  });

  it("crash before the vault call: next run submits the same batch", async () => {
    const ctx = await setup();
    await scene(ctx);
    const calls = spyVault(ctx);
    ctx.deps.hooks = {
      beforeVaultSettle: () => {
        throw new Error("died");
      },
    };
    await expect(runSettlement(ctx.deps)).rejects.toThrow();
    expect(calls).toHaveLength(0);
    const [b] = await ctx.sql`select id from settlement_batches`;
    ctx.deps.hooks = {};
    const r = await runSettlement(ctx.deps);
    expect(r.batchId).toBe(b!.id);
    expect(calls.map((c) => c.batchId)).toEqual([b!.id]);
  });

  it("vault rejection: batch failed, balances restored, settlement paused", async () => {
    const ctx = await setup({ feeBps: 100 });
    const s = await scene(ctx);
    ctx.vault.settle = async () => {
      throw new Error("revert: InsufficientBalance");
    };
    const r = await runSettlement(ctx.deps);
    const [b] = await ctx.sql`select status from settlement_batches where id = ${r.batchId}`;
    expect(b!.status).toBe("failed");
    expect((await ctx.call("GET", "/v1/seller/balance", { token: s.s1.apiKey })).body.owedMicros).toBe("297000");
    expect(await balanceOf(ctx.sql, "test", "fees", "gaitway")).toBe(7500n);
    expect(ctx.deps.state.settlementPaused).toBe(true);
    expect(await runSettlement(ctx.deps)).toEqual({ batchId: null });
  });

  it("charges made while a batch is in flight wait for the next batch", async () => {
    const ctx = await setup();
    const s = await scene(ctx);
    ctx.deps.hooks = {
      beforeVaultSettle: async () => {
        await pay(ctx, s.a1.apiKey, s.s1.apiKey, s.s1.account.sellerId, "7000");
      },
    };
    const r1 = await runSettlement(ctx.deps);
    ctx.deps.hooks = {};
    expect((await ctx.call("GET", "/v1/seller/balance", { token: s.s1.apiKey })).body.owedMicros).toBe("7000");
    const r2 = await runSettlement(ctx.deps);
    expect(r2.batchId).not.toBe(r1.batchId);
    expect((await ctx.call("GET", "/v1/seller/balance", { token: s.s1.apiKey })).body.owedMicros).toBe("0");
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
  });
});

describe("reconcile", () => {
  it("ok with unsettled charges, reports differences and pauses settlement", async () => {
    const ctx = await setup();
    const s = await scene(ctx);
    expect(await runReconcile(ctx.deps)).toEqual({ ok: true, differences: [] });
    (ctx.vault as MemoryVault).setBusinessBalance(s.b2.account.businessId, 1n);
    const r = await runReconcile(ctx.deps);
    expect(r.ok).toBe(false);
    expect(r.differences).toEqual([{ businessId: s.b2.account.businessId, vaultMicros: "1", ledgerMicros: "20000000" }]);
    expect(ctx.deps.state.settlementPaused).toBe(true);
    expect(await runSettlement(ctx.deps)).toEqual({ batchId: null });
  });

  it("ignores deposits not yet credited", async () => {
    const ctx = await setup();
    const b = await fundedBusiness(ctx, "b@x.test", 10);
    await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: "5000000", method: "test" } });
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
    (ctx.vault as MemoryVault).mineBlocks(1);
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
  });
});
