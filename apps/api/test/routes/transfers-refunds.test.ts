import { describe, expect, it } from "vitest";
import { setup, type Ctx } from "../helpers.js";
import { signup, wallet, world } from "../fixtures.js";
import { runSettlement } from "../../src/jobs/settlement.js";
import { runReconcile } from "../../src/jobs/reconcile.js";
import { balanceOf } from "../../src/ledger/ledger.js";

let n = 0;
const ik = () => `t${++n}`;
const transfer = (ctx: Ctx, key: string, body: Record<string, unknown>, k: string | null = ik()) =>
  ctx.call("POST", "/v1/transfers", { token: key, body, headers: k ? { "idempotency-key": k } : {} });
const refund = (ctx: Ctx, key: string, body: Record<string, unknown>) =>
  ctx.call("POST", "/v1/refunds", { token: key, body, headers: { "idempotency-key": ik() } });

describe("transfers", () => {
  it("pushes money from available to the seller", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    expect((await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "1" }, null)).status).toBe(422);
    const r = await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "2500000", reference: "inv-42" });
    expect(r.status).toBe(200);
    expect(r.body.charge).toMatchObject({ credentialId: null, mandateId: null, description: "inv-42", amountMicros: "2500000", sellerId: w.sellerId });
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "27500000", heldMicros: "0" });
    expect((await ctx.call("GET", "/v1/seller/balance", { token: w.seller.apiKey })).body.owedMicros).toBe("2500000");
    const poor = await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "27500001" });
    expect(poor.body.error.code).toBe("insufficient_funds");
    await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey, body: { perPaymentMaxMicros: "10" } });
    expect((await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "11" })).body.error.code).toBe("rule_violation");
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
  });
});

describe("refunds", () => {
  it("full, partial, beyond remainder, fee share, other seller", async () => {
    const ctx = await setup({ feeBps: 100 });
    const w = await world(ctx, 30);
    const ch = (await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "1000000" })).body.charge;
    const other = await signup(ctx, "o@x.test", "seller");
    expect((await refund(ctx, other.apiKey, { chargeId: ch.id })).status).toBe(404);

    const p1 = await refund(ctx, w.seller.apiKey, { chargeId: ch.id, amountMicros: "300000" });
    expect(p1.status).toBe(200);
    expect(p1.body.refund).toMatchObject({ chargeId: ch.id, amountMicros: "300000" });
    expect(p1.body.refund.id).toMatch(/^rfd_/);
    expect(await balanceOf(ctx.sql, "test", "fees", "gaitway")).toBe(10000n - 3000n);
    expect((await ctx.call("GET", "/v1/seller/balance", { token: w.seller.apiKey })).body.owedMicros).toBe(String(990000 - 297000));
    const beyond = await refund(ctx, w.seller.apiKey, { chargeId: ch.id, amountMicros: "700001" });
    expect(beyond.body.error.code).toBe("validation_failed");
    const rest = await refund(ctx, w.seller.apiKey, { chargeId: ch.id });
    expect(rest.body.refund.amountMicros).toBe("700000");
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "30000000" });
    const pays = (await ctx.call("GET", "/v1/payments", { token: w.agent.apiKey })).body.data;
    expect(pays[0].refundedMicros).toBe("1000000");
    expect((await refund(ctx, w.seller.apiKey, { chargeId: ch.id })).body.error.code).toBe("validation_failed");
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
    const tx = (await ctx.call("GET", "/v1/transactions", { token: w.biz.apiKey })).body.data;
    expect(tx[0]).toMatchObject({ type: "refund", amountMicros: "700000" });
  });

  it("after settlement: succeeds when owed covers it, else insufficient_seller_balance; books stay balanced", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const ch = (await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "1000000" })).body.charge;
    await runSettlement(ctx.deps);
    const no = await refund(ctx, w.seller.apiKey, { chargeId: ch.id, amountMicros: "500000" });
    expect(no.status).toBe(409);
    expect(no.body.error.code).toBe("insufficient_seller_balance");
    await transfer(ctx, w.agent.apiKey, { sellerId: w.sellerId, amountMicros: "800000" });
    const yes = await refund(ctx, w.seller.apiKey, { chargeId: ch.id, amountMicros: "500000" });
    expect(yes.status).toBe(200);
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
    const s = await runSettlement(ctx.deps);
    expect(s.batchId).toMatch(/^stl_/);
    expect((await ctx.call("GET", "/v1/seller/balance", { token: w.seller.apiKey })).body).toEqual({ owedMicros: "0", paidOutMicros: "1300000" });
    expect(await runReconcile(ctx.deps)).toEqual({ ok: true, differences: [] });
  });
});
