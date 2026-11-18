import { describe, expect, it } from "vitest";
import { setup } from "../helpers.js";
import { signup } from "../fixtures.js";

const svc = { name: "Relay", description: "Messaging API", priceNote: "1 cent per message", url: "http://localhost:4000" };

describe("seller services and payout address", () => {
  it("create, list, patch services", async () => {
    const ctx = await setup();
    const s = await signup(ctx, "s@x.test", "seller", "Relay Inc");
    const c = await ctx.call("POST", "/v1/services", { token: s.apiKey, body: svc });
    expect(c.status).toBe(200);
    expect(c.body.service).toMatchObject({ ...svc, sellerId: s.account.sellerId, active: true });
    expect(c.body.service.id).toMatch(/^svc_/);
    const l = await ctx.call("GET", "/v1/services", { token: s.sessionToken });
    expect(l.body.data).toHaveLength(1);
    const p = await ctx.call("PATCH", `/v1/services/${c.body.service.id}`, { token: s.apiKey, body: { active: false, priceNote: "free" } });
    expect(p.body.service).toMatchObject({ active: false, priceNote: "free", name: "Relay" });
    const l2 = await ctx.call("GET", "/v1/services", { token: s.apiKey });
    expect(l2.body.data[0].active).toBe(false);
  });

  it("isolation, auth, validation, payout address", async () => {
    const ctx = await setup();
    const s = await signup(ctx, "s@x.test", "seller");
    const s2 = await signup(ctx, "s2@x.test", "seller");
    const b = await signup(ctx, "b@x.test");
    const c = await ctx.call("POST", "/v1/services", { token: s.apiKey, body: svc });
    const foreign = await ctx.call("PATCH", `/v1/services/${c.body.service.id}`, { token: s2.apiKey, body: { active: false } });
    expect(foreign.status).toBe(404);
    const biz = await ctx.call("GET", "/v1/services", { token: b.apiKey });
    expect(biz.status).toBe(403);
    const bad = await ctx.call("POST", "/v1/services", { token: s.apiKey, body: { ...svc, url: "not a url" } });
    expect(bad.body.error.code).toBe("validation_failed");
    const addr = await ctx.call("GET", "/v1/payout-address", { token: s.apiKey });
    const [row] = await ctx.sql`select payout_address from sellers where id = ${s.account.sellerId}`;
    expect(addr.body).toEqual({ address: row!.payout_address });
    expect((await ctx.call("GET", "/v1/payout-address", { token: b.apiKey })).status).toBe(403);
    const newAddr = "0x" + "ab".repeat(20);
    expect((await ctx.call("PUT", "/v1/payout-address", { token: s.apiKey, body: { address: "nope" } })).status).toBe(422);
    expect((await ctx.call("PUT", "/v1/payout-address", { token: s.apiKey, body: { address: newAddr } })).body).toEqual({ address: newAddr });
    expect((await ctx.call("GET", "/v1/payout-address", { token: s.apiKey })).body).toEqual({ address: newAddr });
  });
});
