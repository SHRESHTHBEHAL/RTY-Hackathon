import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";
import { signup } from "./fixtures.js";
import { createApiKey } from "../src/auth/keys.js";

const SECTION_8 = [
  "GET /health", "GET /.well-known/jwks.json", "POST /v1/accounts", "POST /v1/sessions", "GET /v1/sellers", "GET /v1/sellers/{id}",
  "GET /v1/me", "GET /v1/keys", "POST /v1/keys", "DELETE /v1/keys/{id}",
  "POST /v1/agents", "GET /v1/agents", "GET /v1/agents/{id}", "PATCH /v1/agents/{id}", "GET /v1/agents/{id}/keys",
  "POST /v1/agents/{id}/keys", "DELETE /v1/agents/{id}/keys/{keyId}", "GET /v1/balance", "POST /v1/topups", "GET /v1/topups",
  "POST /v1/allocations", "GET /v1/transactions", "GET /v1/agents/{id}/rules", "PUT /v1/agents/{id}/rules", "GET /v1/mandates",
  "DELETE /v1/mandates/{id}", "POST /v1/withdrawals", "GET /v1/withdrawals", "GET /v1/policy-hook", "PUT /v1/policy-hook",
  "DELETE /v1/policy-hook", "GET /v1/wallet", "POST /v1/credentials", "POST /v1/credentials/{id}/release", "GET /v1/payments",
  "POST /v1/mandates", "POST /v1/transfers", "POST /v1/charges", "GET /v1/charges", "GET /v1/credentials/{id}", "GET /v1/payouts",
  "GET /v1/seller/balance", "POST /v1/services", "GET /v1/services", "PATCH /v1/services/{id}", "GET /v1/payout-address",
  "PUT /v1/payout-address", "POST /v1/mandate-charges", "POST /v1/refunds", "PUT /v1/webhook",
];

describe("live mode", () => {
  it("live keys are refused while LIVE_ENABLED is false", async () => {
    const ctx = await setup();
    const b = await signup(ctx, "b@x.test");
    const { apiKey } = await createApiKey(ctx.sql, "live", "business", { businessId: b.account.businessId }, "live");
    const r = await ctx.call("GET", "/v1/agents", { token: apiKey });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("live_disabled");
  });

  it("with LIVE_ENABLED, live and test data are invisible to each other; test top-ups refused in live", async () => {
    const ctx = await setup({ config: { liveEnabled: true } });
    const b = await signup(ctx, "b@x.test");
    const { apiKey: live } = await createApiKey(ctx.sql, "live", "business", { businessId: b.account.businessId }, "live");
    const a = await ctx.call("POST", "/v1/agents", { token: live, body: { name: "Live agent" } });
    expect(a.body.apiKey).toMatch(/^gw_live_agt_/);
    await ctx.call("POST", "/v1/agents", { token: b.apiKey, body: { name: "Test agent" } });
    expect((await ctx.call("GET", "/v1/agents", { token: live })).body.data.map((x: any) => x.name)).toEqual(["Live agent"]);
    expect((await ctx.call("GET", "/v1/agents", { token: b.apiKey })).body.data.map((x: any) => x.name)).toEqual(["Test agent"]);
    expect((await ctx.call("GET", `/v1/agents/${a.body.agent.id}`, { token: b.apiKey })).status).toBe(404);
    const t = await ctx.call("POST", "/v1/topups", { token: live, body: { amountMicros: "1", method: "test" } });
    expect(t.body.error.code).toBe("validation_failed");
    expect((await ctx.call("GET", "/v1/topups", { token: b.apiKey })).body.data).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("429 after 100 requests in 10 seconds per key", async () => {
    const ctx = await setup({ config: { rateLimitPer10s: 100 } });
    const b = await signup(ctx, "b@x.test");
    for (let i = 0; i < 100; i++) expect((await ctx.call("GET", "/v1/me", { token: b.apiKey })).status).toBe(200);
    const r = await ctx.call("GET", "/v1/me", { token: b.apiKey });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("rate_limited");
    expect((await ctx.call("GET", "/v1/me", { token: b.sessionToken })).status).toBe(200);
    ctx.clock.advance(10_001);
    expect((await ctx.call("GET", "/v1/me", { token: b.apiKey })).status).toBe(200);
  });
});

describe("openapi", () => {
  it("lists every route in context.md section 8", async () => {
    const ctx = await setup();
    const r = await ctx.call("GET", "/v1/openapi.json");
    expect(r.status).toBe(200);
    const listed = new Set<string>();
    for (const [path, ops] of Object.entries(r.body.paths as Record<string, object>)) {
      for (const m of Object.keys(ops)) listed.add(`${m.toUpperCase()} ${path}`);
    }
    for (const route of SECTION_8) expect(listed, route).toContain(route);
  });
});
