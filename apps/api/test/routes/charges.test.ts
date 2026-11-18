import { describe, expect, it } from "vitest";
import { setup, type Ctx } from "../helpers.js";
import { createAgent, signup, wallet, world } from "../fixtures.js";
import { runSweeper } from "../../src/jobs/sweeper.js";
import { balanceOf } from "../../src/ledger/ledger.js";

let n = 0;
const ik = () => `k${++n}-${Date.now()}`;

async function cred(ctx: Ctx, agentKey: string, sellerId: string, maxMicros = "1000000", ttlSeconds?: number) {
  const r = await ctx.call("POST", "/v1/credentials", { token: agentKey, body: { sellerId, maxMicros, ttlSeconds } });
  if (r.status !== 200) throw new Error(r.text);
  return r.body.credential;
}

function charge(ctx: Ctx, sellerKey: string, body: Record<string, unknown>, key: string | null = ik()) {
  return ctx.call("POST", "/v1/charges", { token: sellerKey, body, headers: key ? { "idempotency-key": key } : {} });
}

describe("charges", () => {
  it("charges a credential and moves money to the seller", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const c = await cred(ctx, w.agent.apiKey, w.sellerId);
    const r = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "10000", description: "1 message" });
    expect(r.status).toBe(200);
    expect(r.body.remainingMicros).toBe("990000");
    expect(r.body.charge).toMatchObject({
      credentialId: c.id,
      mandateId: null,
      sellerId: w.sellerId,
      agentId: w.agent.agent.id,
      amountMicros: "10000",
      feeMicros: "0",
      refundedMicros: "0",
      description: "1 message",
    });
    expect(r.body.charge.id).toMatch(/^chg_/);
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "29000000", heldMicros: "990000" });
    const bal = await ctx.call("GET", "/v1/seller/balance", { token: w.seller.apiKey });
    expect(bal.body).toEqual({ owedMicros: "10000", paidOutMicros: "0" });
    const tx = await ctx.call("GET", "/v1/transactions", { token: w.biz.apiKey });
    expect(tx.body.data[0]).toMatchObject({ type: "charge", amountMicros: "-10000", counterparty: w.sellerId });
  });

  it("applies the platform fee", async () => {
    const ctx = await setup({ feeBps: 150 });
    const w = await world(ctx, 30);
    const c = await cred(ctx, w.agent.apiKey, w.sellerId);
    const r = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "10000" });
    expect(r.body.charge).toMatchObject({ amountMicros: "10000", feeMicros: "150" });
    expect((await ctx.call("GET", "/v1/seller/balance", { token: w.seller.apiKey })).body.owedMicros).toBe("9850");
    expect(await balanceOf(ctx.sql, "test", "fees", "gaitway")).toBe(150n);
  });

  it("idempotency: required, replays identically, conflicts on different body", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const c = await cred(ctx, w.agent.apiKey, w.sellerId);
    const missing = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "1" }, null);
    expect(missing.status).toBe(422);
    const key = ik();
    const [a, b] = await Promise.all([
      charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "10000" }, key),
      charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "10000" }, key),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.text).toBe(b.text);
    const again = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "10000" }, key);
    expect(again.text).toBe(a.text);
    const [{ count }] = await ctx.sql`select count(*)::int as count from charges`;
    expect(count).toBe(1);
    const diff = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "20000" }, key);
    expect(diff.status).toBe(409);
    expect(diff.body.error.code).toBe("idempotency_conflict");
  });

  it("refuses: over remaining, wrong seller, expired, released", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const c = await cred(ctx, w.agent.apiKey, w.sellerId, "1000000", 60);
    const over = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "1000001" });
    expect(over.body.error.code).toBe("amount_exceeds_remaining");
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ heldMicros: "1000000" });
    const other = await signup(ctx, "other@x.test", "seller");
    const wrong = await charge(ctx, other.apiKey, { credentialId: c.id, amountMicros: "1" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("forbidden");
    const bad = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "1.5" });
    expect(bad.body.error.code).toBe("validation_failed");

    ctx.clock.advance(61_000);
    const exp = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "1" });
    expect(exp.status).toBe(409);
    expect(exp.body.error.code).toBe("credential_expired");
    await runSweeper(ctx.deps);
    const exp2 = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "1" });
    expect(exp2.body.error.code).toBe("credential_expired");

    const c2 = await cred(ctx, w.agent.apiKey, w.sellerId);
    await ctx.call("POST", `/v1/credentials/${c2.id}/release`, { token: w.agent.apiKey });
    const rel = await charge(ctx, w.seller.apiKey, { credentialId: c2.id, amountMicros: "1" });
    expect(rel.body.error.code).toBe("credential_not_active");
  });

  it("final releases the remainder; exact remainder exhausts", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const c = await cred(ctx, w.agent.apiKey, w.sellerId);
    const f = await charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "10000", final: true });
    expect(f.status).toBe(200);
    expect(f.body.remainingMicros).toBe("0");
    const g = await ctx.call("GET", `/v1/credentials/${c.id}`, { token: w.seller.apiKey });
    expect(g.body.credential.status).toBe("released");
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "29990000", heldMicros: "0" });

    const c2 = await cred(ctx, w.agent.apiKey, w.sellerId, "500000");
    await charge(ctx, w.seller.apiKey, { credentialId: c2.id, amountMicros: "200000" });
    const e = await charge(ctx, w.seller.apiKey, { credentialId: c2.id, amountMicros: "300000" });
    expect(e.body.remainingMicros).toBe("0");
    const g2 = await ctx.call("GET", `/v1/credentials/${c2.id}`, { token: w.agent.apiKey });
    expect(g2.body.credential.status).toBe("exhausted");
    const after = await charge(ctx, w.seller.apiKey, { credentialId: c2.id, amountMicros: "1" });
    expect(after.body.error.code).toBe("credential_not_active");
  });

  it("10 concurrent charges of 200000 on 1000000: exactly 5 succeed", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const c = await cred(ctx, w.agent.apiKey, w.sellerId);
    const rs = await Promise.all(Array.from({ length: 10 }, () => charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "200000" })));
    expect(rs.filter((r) => r.status === 200).length).toBe(5);
    expect((await ctx.call("GET", "/v1/seller/balance", { token: w.seller.apiKey })).body.owedMicros).toBe("1000000");
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "29000000", heldMicros: "0" });
  });

  it("charge racing the sweeper at expiry: money ends in exactly one place", async () => {
    for (let i = 0; i < 5; i++) {
      const ctx = await setup({ feeBps: 100 });
      const w = await world(ctx, 30);
      const c = await cred(ctx, w.agent.apiKey, w.sellerId, "1000000", 10);
      ctx.clock.advance(9_999);
      const [r] = await Promise.all([
        charge(ctx, w.seller.apiKey, { credentialId: c.id, amountMicros: "400000" }),
        (async () => {
          ctx.clock.advance(1);
          return runSweeper(ctx.deps);
        })(),
      ]);
      expect([200, 409]).toContain(r.status);
      await runSweeper(ctx.deps);
      const wl = await wallet(ctx, w.agent.apiKey);
      const owed = await balanceOf(ctx.sql, "test", "owed", w.sellerId);
      const fees = await balanceOf(ctx.sql, "test", "fees", "gaitway");
      expect(wl.heldMicros).toBe("0");
      expect(BigInt(wl.availableMicros) + BigInt(wl.heldMicros) + owed + fees).toBe(30_000_000n);
    }
  });

  it("payments and charges lists are scoped to their owner", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const a2 = await createAgent(ctx, w.biz.apiKey, "Second");
    await ctx.call("POST", "/v1/allocations", { token: w.biz.apiKey, body: { walletId: a2.agent.walletId, amountMicros: "5000000", direction: "to_wallet" } });
    const s2 = await signup(ctx, "s2@x.test", "seller");
    const c1 = await cred(ctx, w.agent.apiKey, w.sellerId);
    const c2 = await cred(ctx, a2.apiKey, s2.account.sellerId);
    await charge(ctx, w.seller.apiKey, { credentialId: c1.id, amountMicros: "1" });
    await charge(ctx, s2.apiKey, { credentialId: c2.id, amountMicros: "2" });
    const p1 = await ctx.call("GET", "/v1/payments", { token: w.agent.apiKey });
    expect(p1.body.data.map((x: any) => x.amountMicros)).toEqual(["1"]);
    const ch2 = await ctx.call("GET", "/v1/charges", { token: s2.apiKey });
    expect(ch2.body.data.map((x: any) => x.amountMicros)).toEqual(["2"]);
    expect((await ctx.call("GET", "/v1/charges", { token: w.agent.apiKey })).status).toBe(403);
  });
});
