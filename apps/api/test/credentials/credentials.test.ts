import { describe, expect, it } from "vitest";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, createLocalJWKSet } from "jose";
import { buildApp } from "../../src/app.js";
import { setup } from "../helpers.js";
import { createAgent, signup, wallet, world } from "../fixtures.js";
import { runSweeper } from "../../src/jobs/sweeper.js";

void createRemoteJWKSet;

describe("credentials", () => {
  it("creates a credential with a hold and a correct token", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const r = await ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: "1000000" } });
    expect(r.status).toBe(200);
    const c = r.body.credential;
    expect(c).toMatchObject({
      sellerId: w.sellerId,
      agentId: w.agent.agent.id,
      businessId: w.biz.account.businessId,
      maxMicros: "1000000",
      remainingMicros: "1000000",
      status: "active",
    });
    expect(c.id).toMatch(/^crd_/);
    expect(new Date(c.expiresAt).getTime() - ctx.clock.now().getTime()).toBeGreaterThan(299_000);
    expect(new Date(c.expiresAt).getTime() - ctx.clock.now().getTime()).toBeLessThanOrEqual(300_000);
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "29000000", heldMicros: "1000000" });

    const jwks = await ctx.call("GET", "/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    const header = decodeProtectedHeader(c.token);
    expect(header).toMatchObject({ alg: "ES256", typ: "gaitway-credential+jwt" });
    expect(typeof header.kid).toBe("string");
    const { payload } = await jwtVerify(c.token, createLocalJWKSet(jwks.body), {
      issuer: ctx.config.issuer,
      audience: w.sellerId,
      currentDate: ctx.clock.now(),
      typ: "gaitway-credential+jwt",
    });
    expect(payload).toMatchObject({
      iss: ctx.config.issuer,
      sub: w.agent.agent.id,
      aud: w.sellerId,
      jti: c.id,
      env: "test",
      biz: { id: w.biz.account.businessId, name: "Acme", email: "biz@x.test", verified: false },
      agent: { id: w.agent.agent.id, name: "Agent" },
      max: "1000000",
      cur: "USD",
    });
    expect(payload.exp! - payload.iat!).toBe(300);
    expect(new Date(c.expiresAt).getTime()).toBe(payload.exp! * 1000);
  });

  it("validates ttl, seller, funds, agent status", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const k = w.agent.apiKey;
    for (const ttlSeconds of [9, 86401, 1.5]) {
      const r = await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: w.sellerId, maxMicros: "1", ttlSeconds } });
      expect(r.body.error.code).toBe("validation_failed");
    }
    const ok10 = await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: w.sellerId, maxMicros: "1", ttlSeconds: 10 } });
    expect(ok10.status).toBe(200);
    const unknown = await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: "sel_nope", maxMicros: "1" } });
    expect(unknown.status).toBe(404);
    const poor = await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: w.sellerId, maxMicros: "31000000" } });
    expect(poor.status).toBe(402);
    expect(poor.body.error.code).toBe("insufficient_funds");
    expect(await wallet(ctx, k)).toMatchObject({ availableMicros: "29999999", heldMicros: "1" });

    await ctx.call("PATCH", `/v1/agents/${w.agent.agent.id}`, { token: w.biz.apiKey, body: { status: "disabled" } });
    const dis = await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: w.sellerId, maxMicros: "1" } });
    expect(dis.status).toBe(403);
    expect(dis.body.error.code).toBe("forbidden");
  });

  it("two simultaneous 20-dollar requests on a 30-dollar wallet: exactly one succeeds", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const reqs = await Promise.all(
      [0, 1].map(() => ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: "20000000" } })),
    );
    expect(reqs.map((r) => r.status).sort()).toEqual([200, 402]);
    expect(await wallet(ctx, w.agent.apiKey)).toMatchObject({ availableMicros: "10000000", heldMicros: "20000000" });
  });

  it("release, double release, foreign release, sweeper expiry, read access", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const k = w.agent.apiKey;
    const c1 = (await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: w.sellerId, maxMicros: "5000000" } })).body.credential;

    const other = await createAgent(ctx, w.biz.apiKey, "Other");
    const foreign = await ctx.call("POST", `/v1/credentials/${c1.id}/release`, { token: other.apiKey });
    expect(foreign.status).toBe(404);

    const rel = await ctx.call("POST", `/v1/credentials/${c1.id}/release`, { token: k });
    expect(rel.status).toBe(200);
    expect(rel.body.credential.status).toBe("released");
    expect(rel.body.credential.token).toBeUndefined();
    const rel2 = await ctx.call("POST", `/v1/credentials/${c1.id}/release`, { token: k });
    expect(rel2.body).toEqual(rel.body);
    expect(await wallet(ctx, k)).toMatchObject({ availableMicros: "30000000", heldMicros: "0" });

    const c2 = (await ctx.call("POST", "/v1/credentials", { token: k, body: { sellerId: w.sellerId, maxMicros: "2000000", ttlSeconds: 60 } })).body.credential;
    expect(await runSweeper(ctx.deps)).toBe(0);
    ctx.clock.advance(61_000);
    expect(await runSweeper(ctx.deps)).toBe(1);
    expect(await runSweeper(ctx.deps)).toBe(0);
    expect(await wallet(ctx, k)).toMatchObject({ availableMicros: "30000000", heldMicros: "0" });

    const bySeller = await ctx.call("GET", `/v1/credentials/${c2.id}`, { token: w.seller.apiKey });
    expect(bySeller.status).toBe(200);
    expect(bySeller.body.credential.status).toBe("expired");
    expect(bySeller.body.credential.token).toBeUndefined();
    const byAgent = await ctx.call("GET", `/v1/credentials/${c2.id}`, { token: k });
    expect(byAgent.status).toBe(200);
    const otherSeller = await signup(ctx, "s2@x.test", "seller");
    expect((await ctx.call("GET", `/v1/credentials/${c2.id}`, { token: otherSeller.apiKey })).status).toBe(404);
    expect((await ctx.call("GET", `/v1/credentials/${c2.id}`, { token: other.apiKey })).status).toBe(404);
  });

  it("signing keys persist across app instances", async () => {
    const ctx = await setup();
    const a = await ctx.call("GET", "/.well-known/jwks.json");
    const app2 = buildApp({ ...ctx.deps });
    const b = (await (await app2.request("/.well-known/jwks.json")).json()) as any;
    expect(a.body.keys[0].kid).toBe(b.keys[0].kid);
    expect(a.body.keys[0].d).toBeUndefined();
  });
});
