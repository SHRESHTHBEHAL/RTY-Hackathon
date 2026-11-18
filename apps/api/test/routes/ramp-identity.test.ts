import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { setup } from "../helpers.js";
import { confirmDeposits, signup, world } from "../fixtures.js";
import { createSimulatedRamp } from "../../src/ramp/simulated.js";
import { createSimulatedIdentity } from "../../src/identity/simulated.js";

describe("ramp and identity slots (simulated)", () => {
  it("ramp top-up is refused without a provider", async () => {
    const ctx = await setup();
    const b = await signup(ctx, "b@x.test");
    const r = await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: "1000000", method: "ramp" } });
    expect(r.body.error.code).toBe("validation_failed");
  });

  it("simulated ramp top-up confirms through the deposit job", async () => {
    const ctx = await setup();
    ctx.deps.ramp = createSimulatedRamp(ctx.vault);
    const b = await signup(ctx, "b@x.test");
    const r = await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: "7000000", method: "ramp" } });
    expect(r.status).toBe(200);
    expect(r.body.topup).toMatchObject({ method: "ramp", status: "pending" });
    await confirmDeposits(ctx);
    const list = (await ctx.call("GET", "/v1/topups", { token: b.apiKey })).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: r.body.topup.id, method: "ramp", status: "confirmed" });
    expect((await ctx.call("GET", "/v1/balance", { token: b.apiKey })).body.unallocatedMicros).toBe("7000000");
  });

  it("a verified business's credentials carry biz.verified = true", async () => {
    const ctx = await setup();
    const w = await world(ctx, 5);
    expect((await ctx.call("POST", "/v1/verification", { token: w.biz.apiKey })).body.error.code).toBe("validation_failed");
    ctx.deps.identity = createSimulatedIdentity();
    const v = await ctx.call("POST", "/v1/verification", { token: w.biz.apiKey });
    expect(v.body).toMatchObject({ verified: true, verifier: "simulated" });
    const c = await ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: "1" } });
    expect((decodeJwt(c.body.credential.token) as any).biz.verified).toBe(true);
  });
});
