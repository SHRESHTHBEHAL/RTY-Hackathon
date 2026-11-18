import { describe, expect, it } from "vitest";
import { setup, type Ctx } from "../helpers.js";
import { world } from "../fixtures.js";
import { signBody } from "../../src/jobs/webhooks.js";

type Seen = { url: string; body: string; sig: string | null };

function hook(ctx: Ctx, reply: (seen: Seen) => Promise<Response> | Response) {
  const seen: Seen[] = [];
  ctx.deps.fetch = (async (url: string, init: RequestInit) => {
    const s = { url, body: init.body as string, sig: new Headers(init.headers).get("gaitway-signature") };
    seen.push(s);
    return reply(s);
  }) as unknown as typeof fetch;
  return seen;
}
const cred = (ctx: Ctx, w: Awaited<ReturnType<typeof world>>) =>
  ctx.call("POST", "/v1/credentials", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxMicros: "10000" } });
const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });

describe("policy hook", () => {
  it("not called without a hook; set/get/delete", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const seen = hook(ctx, () => ok({ outcome: "block", reasons: ["x"], approvalLink: null }));
    expect((await cred(ctx, w)).status).toBe(200);
    expect(seen).toHaveLength(0);
    expect((await ctx.call("GET", "/v1/policy-hook", { token: w.biz.apiKey })).body).toEqual({ url: null });
    const put = await ctx.call("PUT", "/v1/policy-hook", { token: w.biz.apiKey, body: { url: "http://localhost:9000/check" } });
    expect(put.body.url).toBe("http://localhost:9000/check");
    expect(typeof put.body.secret).toBe("string");
    expect((await ctx.call("GET", "/v1/policy-hook", { token: w.biz.apiKey })).body).toEqual({ url: "http://localhost:9000/check" });
    expect((await ctx.call("PUT", "/v1/policy-hook", { token: w.biz.apiKey, body: { url: "http://evil.example/x" } })).status).toBe(422);
    expect((await ctx.call("DELETE", "/v1/policy-hook", { token: w.biz.apiKey })).body).toEqual({ ok: true });
    expect((await ctx.call("GET", "/v1/policy-hook", { token: w.biz.apiKey })).body).toEqual({ url: null });
  });

  it("allow passes; hold/block refuse with reasons and details; request is signed; no rows locked while waiting", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    const { secret } = (await ctx.call("PUT", "/v1/policy-hook", { token: w.biz.apiKey, body: { url: "https://hook.test/check" } })).body;
    let lockedOk = true;
    const seen = hook(ctx, async () => {
      // A concurrent transaction must be able to lock the wallet's rows while the hook is waiting.
      try {
        await ctx.sql.begin((tx) => tx`select id from ledger_accounts where owner_id = ${w.agent.agent.walletId} for update nowait`);
      } catch {
        lockedOk = false;
      }
      return ok({ outcome: "allow", reasons: [], approvalLink: null });
    });
    expect((await cred(ctx, w)).status).toBe(200);
    expect(lockedOk).toBe(true);
    const body = JSON.parse(seen[0]!.body);
    expect(body).toMatchObject({ type: "credential", agentId: w.agent.agent.id, walletId: w.agent.agent.walletId, sellerId: w.sellerId, amountMicros: "10000" });
    expect(body.id).toMatch(/^evt_/);
    expect(seen[0]!.sig).toBe(signBody(seen[0]!.body, secret));

    hook(ctx, () => ok({ outcome: "hold", reasons: ["over threshold", "new vendor"], approvalLink: "https://approve.test/1" }));
    const held = await cred(ctx, w);
    expect(held.status).toBe(403);
    expect(held.body.error).toEqual({
      code: "rule_violation",
      message: "over threshold; new vendor",
      details: { outcome: "hold", approvalLink: "https://approve.test/1" },
    });
    hook(ctx, () => ok({ outcome: "block", reasons: ["no"], approvalLink: null }));
    expect((await cred(ctx, w)).body.error.details.outcome).toBe("block");
    const t = await ctx.call("POST", "/v1/transfers", { token: w.agent.apiKey, body: { sellerId: w.sellerId, amountMicros: "1" }, headers: { "idempotency-key": "p1" } });
    expect(t.body.error.code).toBe("rule_violation");
    const m = await ctx.call("POST", "/v1/mandates", { token: w.agent.apiKey, body: { sellerId: w.sellerId, maxPerPeriodMicros: "5", period: "day" } });
    expect(m.body.error.code).toBe("rule_violation");
    expect((await ctx.call("GET", "/v1/wallet", { token: w.agent.apiKey })).body.wallet.heldMicros).toBe("10000");
  });

  it("timeout, non-200 and malformed replies refuse", async () => {
    const ctx = await setup();
    const w = await world(ctx, 30);
    await ctx.call("PUT", "/v1/policy-hook", { token: w.biz.apiKey, body: { url: "https://hook.test/check" } });
    hook(ctx, () => new Response("{}", { status: 500 }));
    expect((await cred(ctx, w)).body.error.code).toBe("rule_violation");
    hook(ctx, () => ok({ outcome: "maybe" }));
    expect((await cred(ctx, w)).body.error.code).toBe("rule_violation");
    ctx.deps.fetch = ((_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    const slow = await cred(ctx, w);
    expect(slow.body.error.code).toBe("rule_violation");
    expect(Date.now() - t0).toBeLessThan(3500);
  });
});
