import { describe, expect, it } from "vitest";
import { setup } from "../helpers.js";
import { signup, world } from "../fixtures.js";
import { runWebhookJob, signBody } from "../../src/jobs/webhooks.js";
import { runSettlement } from "../../src/jobs/settlement.js";

describe("directory", () => {
  it("searches sellers and services case-insensitively, listing only active services", async () => {
    const ctx = await setup();
    const a = await signup(ctx, "a@x.test", "seller", "Relay Messaging");
    const b = await signup(ctx, "b@x.test", "seller", "Mapper");
    const base = { description: "d", priceNote: "p", url: "https://example.com" };
    await ctx.call("POST", "/v1/services", { token: a.apiKey, body: { ...base, name: "SMS" } });
    const off = await ctx.call("POST", "/v1/services", { token: a.apiKey, body: { ...base, name: "Fax" } });
    await ctx.call("PATCH", `/v1/services/${off.body.service.id}`, { token: a.apiKey, body: { active: false } });
    await ctx.call("POST", "/v1/services", { token: b.apiKey, body: { ...base, name: "Geocode" } });

    const relay = await ctx.call("GET", "/v1/sellers?query=relay");
    expect(relay.status).toBe(200);
    expect(relay.body.data).toHaveLength(1);
    expect(relay.body.data[0]).toMatchObject({ id: a.account.sellerId, name: "Relay Messaging" });
    expect(relay.body.data[0].services.map((s: any) => s.name)).toEqual(["SMS"]);
    expect((await ctx.call("GET", "/v1/sellers?query=GEO")).body.data.map((s: any) => s.id)).toEqual([b.account.sellerId]);
    expect((await ctx.call("GET", "/v1/sellers?query=fax")).body.data).toHaveLength(0);
    expect((await ctx.call("GET", "/v1/sellers")).body.data).toHaveLength(2);
    const one = await ctx.call("GET", `/v1/sellers/${a.account.sellerId}`);
    expect(one.body.seller.services).toHaveLength(1);
    expect((await ctx.call("GET", "/v1/sellers/sel_nope")).status).toBe(404);
  });
});

describe("webhooks", () => {
  it("delivers signed events with retries and refuses plain-http non-local URLs", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const bad = await ctx.call("PUT", "/v1/webhook", { token: w.seller.apiKey, body: { url: "http://example.com/hook" } });
    expect(bad.body.error.code).toBe("validation_failed");
    const put = await ctx.call("PUT", "/v1/webhook", { token: w.seller.apiKey, body: { url: "http://localhost:4000/hook" } });
    expect(put.status).toBe(200);
    expect(put.body.url).toBe("http://localhost:4000/hook");
    expect(put.body.secret).toMatch(/^whsec_/);

    await ctx.call("POST", "/v1/transfers", { token: w.agent.apiKey, body: { sellerId: w.sellerId, amountMicros: "1000" }, headers: { "idempotency-key": "w1" } });
    await runSettlement(ctx.deps);

    const got: { body: string; sig: string | null }[] = [];
    let fail = 2;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      if (fail-- > 0) return new Response("no", { status: 500 });
      got.push({ body: init.body as string, sig: new Headers(init.headers).get("gaitway-signature") });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    expect(await runWebhookJob(ctx.deps, fakeFetch)).toBe(0);
    ctx.clock.advance(2_000);
    expect(await runWebhookJob(ctx.deps, fakeFetch)).toBe(0);
    ctx.clock.advance(4_000);
    expect(await runWebhookJob(ctx.deps, fakeFetch)).toBe(1);
    const ev = JSON.parse(got[0]!.body);
    expect(ev).toMatchObject({ type: "payout.sent", data: { payout: { sellerId: w.sellerId, amountMicros: "1000" } } });
    expect(ev.id).toMatch(/^evt_/);
    expect(got[0]!.sig).toBe(signBody(got[0]!.body, put.body.secret));

    // gives up after 5 attempts
    const m = (await ctx.call("POST", "/v1/mandates", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxPerPeriodMicros: "1", period: "day" } })).body.mandate;
    await ctx.call("DELETE", `/v1/mandates/${m.id}`, { token: w.biz.apiKey });
    const down = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    for (let i = 0; i < 6; i++) {
      await runWebhookJob(ctx.deps, down);
      ctx.clock.advance(60_000);
    }
    const [row] = await ctx.sql`select status, attempts from webhook_events where type = 'mandate.revoked'`;
    expect(row).toMatchObject({ status: "failed", attempts: 5 });
  });
});
