import { describe, expect, it } from "vitest";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { setup, type Ctx } from "../helpers.js";
import { world } from "../fixtures.js";
import { periodStart } from "../../src/routes/mandates.js";

let n = 0;
const mc = (ctx: Ctx, key: string, body: Record<string, unknown>, ik = `m${++n}`) =>
  ctx.call("POST", "/v1/mandate-charges", { token: key, body, headers: { "idempotency-key": ik } });

describe("mandates", () => {
  it("creates a mandate token and charges from available with no hold", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const r = await ctx.call("POST", "/v1/mandates", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxPerPeriodMicros: "1000000", period: "day" } });
    expect(r.status).toBe(200);
    const m = r.body.mandate;
    expect(m).toMatchObject({ walletId: w.agent.agent.walletId, agentId: w.agent.agent.id, sellerId: w.sellerId, maxPerPeriodMicros: "1000000", period: "day", status: "active" });
    expect(m.id).toMatch(/^mdt_/);
    expect(decodeProtectedHeader(m.token).typ).toBe("gaitway-mandate+jwt");
    const jwks = (await ctx.call("GET", "/.well-known/jwks.json")).body;
    const { payload } = await jwtVerify(m.token, createLocalJWKSet(jwks), { audience: w.sellerId, currentDate: ctx.clock.now() });
    expect(payload).toMatchObject({ jti: m.id, sub: w.agent.agent.id, maxPerPeriod: "1000000", period: "day", cur: "USD", env: "test" });
    expect(payload.max).toBeUndefined();
    expect(payload.exp! - payload.iat!).toBe(365 * 86400);

    const ch = await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "600000", description: "sub" });
    expect(ch.status).toBe(200);
    expect(ch.body.charge).toMatchObject({ mandateId: m.id, credentialId: null, amountMicros: "600000", description: "sub" });
    expect((await ctx.call("GET", "/v1/wallet", { token: w.agent.apiKey })).body.wallet).toMatchObject({ availableMicros: "29400000", heldMicros: "0" });
    const over = await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "400001" });
    expect(over.body.error.code).toBe("rule_violation");
    expect((await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "400000" })).status).toBe(200);
    ctx.clock.advance(86_400_000);
    expect((await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "400000" })).status).toBe(200);
    // idempotency applies
    const a = await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "1" }, "same");
    const b = await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "1" }, "same");
    expect(a.text).toBe(b.text);
  });

  it("insufficient funds, rules, revocation, listing", async () => {
    const ctx = await setup();
    const w = await world(ctx, 1);
    const m = (await ctx.call("POST", "/v1/mandates", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxPerPeriodMicros: "5000000", period: "month" } })).body.mandate;
    const poor = await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "2000000" });
    expect(poor.status).toBe(402);
    await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey, body: { perPaymentMaxMicros: "100", dailyMaxMicros: null, allowedSellerIds: null } });
    expect((await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "101" })).body.error.code).toBe("rule_violation");
    await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey, body: { allowedSellerIds: [] } });
    const blocked = await ctx.call("POST", "/v1/mandates", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxPerPeriodMicros: "1", period: "week" } });
    expect(blocked.body.error.code).toBe("rule_violation");
    await ctx.call("PUT", `/v1/agents/${w.agent.agent.id}/rules`, { token: w.biz.apiKey, body: {} });

    const list = await ctx.call("GET", "/v1/mandates", { token: w.biz.apiKey });
    expect(list.body.data.map((x: any) => x.id)).toEqual([m.id]);
    expect(list.body.data[0].token).toBeUndefined();
    const rv = await ctx.call("DELETE", `/v1/mandates/${m.id}`, { token: w.biz.apiKey });
    expect(rv.body.mandate.status).toBe("revoked");
    const after = await mc(ctx, w.seller.apiKey, { mandateId: m.id, amountMicros: "1" });
    expect(after.status).toBe(409);
    expect(after.body.error.code).toBe("credential_not_active");
  });

  it("periods are UTC calendar day, ISO week, calendar month", () => {
    const t = new Date("2026-11-18T15:30:00Z"); // a Wednesday
    expect(periodStart("day", t).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(periodStart("week", t).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-11-22T23:59:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodStart("month", t).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
