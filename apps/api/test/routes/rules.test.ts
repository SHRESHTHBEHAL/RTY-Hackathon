import { describe, expect, it } from "vitest";
import { setup, type Ctx } from "../helpers.js";
import { signup, world } from "../fixtures.js";

let n = 0;
async function credAndCharge(ctx: Ctx, w: Awaited<ReturnType<typeof world>>, max: string, amount: string) {
  const c = await ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: max } });
  if (c.status !== 200) return c;
  return ctx.call("POST", "/v1/charges", {
    token: w.seller.apiKey,
    body: { credentialId: c.body.credential.id, amountMicros: amount },
    headers: { "idempotency-key": `r${++n}` },
  });
}

describe("spending rules", () => {
  it("defaults to all null and blocks nothing", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const r = await ctx.call("GET", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey });
    expect(r.body).toEqual({ rules: { perPaymentMaxMicros: null, dailyMaxMicros: null, allowedSellerIds: null } });
    expect((await credAndCharge(ctx, w, "5000000", "5000000")).status).toBe(200);
  });

  it("per-payment max and allow-list block credential creation", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const put = await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, {
      token: w.biz.apiKey,
      body: { perPaymentMaxMicros: "1000000", dailyMaxMicros: null, allowedSellerIds: [w.sellerId] },
    });
    expect(put.body.rules).toEqual({ perPaymentMaxMicros: "1000000", dailyMaxMicros: null, allowedSellerIds: [w.sellerId] });
    const big = await ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: "1000001" } });
    expect(big.status).toBe(403);
    expect(big.body.error.code).toBe("rule_violation");
    const other = await signup(ctx, "o@x.test", "seller");
    const blocked = await ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: other.account.sellerId, maxMicros: "1" } });
    expect(blocked.body.error.code).toBe("rule_violation");
    await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey, body: { perPaymentMaxMicros: null, dailyMaxMicros: null, allowedSellerIds: [] } });
    const none = await ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: "1" } });
    expect(none.body.error.code).toBe("rule_violation");
    expect((await ctx.call("GET", "/v1/wallet", { token: w.agent.apiKey })).body.wallet.heldMicros).toBe("0");
    const other2 = await signup(ctx, "b2@x.test");
    expect((await ctx.call("GET", `/v1/agents/${w.agent.agent.id}/rules`, { token: other2.apiKey })).status).toBe(404);
  });

  it("daily max over the UTC day: exactly at the cap passes, above is refused, resets at midnight UTC", async () => {
    const ctx = await setup();
    const now = ctx.clock.now();
    const msToMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
    const w = await world(ctx, 30);
    await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey, body: { perPaymentMaxMicros: null, dailyMaxMicros: "100000", allowedSellerIds: null } });
    expect((await credAndCharge(ctx, w, "60000", "60000")).status).toBe(200);
    expect((await credAndCharge(ctx, w, "40000", "40000")).status).toBe(200);
    const over = await credAndCharge(ctx, w, "1", "1");
    expect(over.status).toBe(403);
    expect(over.body.error.code).toBe("rule_violation");
    ctx.clock.advance(msToMidnight + 1000);
    expect((await credAndCharge(ctx, w, "1", "1")).status).toBe(200);
  });
});
