import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { startMockGaitway, type MockGaitway } from "../src/testing/mock-gaitway.js";
import { GaitwaySeller, usd } from "../src/index.js";
import { gaitwayExpress } from "../src/seller-express.js";

let mock: MockGaitway;
const servers: Server[] = [];
beforeAll(async () => {
  mock = await startMockGaitway();
});
afterAll(async () => {
  await Promise.all(
    servers.map((s) => new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); })),
  );
  await mock.close();
});

const PRICE = usd("0.01");

async function setup(opts: { handler?: (req: express.Request, res: express.Response) => void; baseUrl?: string } = {}) {
  const biz = mock.addBusiness({ name: "Acme", email: "ops@acme.test" });
  const agent = mock.addAgent(biz.id, usd("1"), "Scout");
  const seller = mock.addSeller();
  const client = new GaitwaySeller({ apiKey: seller.apiKey, sellerId: seller.id, baseUrl: opts.baseUrl ?? mock.url });
  const handler = vi.fn(
    opts.handler ??
      ((req: express.Request, res: express.Response) => {
        res.json({ ok: true, gaitway: req.gaitway });
      }),
  );
  const app = express();
  app.post("/relay", gaitwayExpress(client, { priceMicros: PRICE, priceNote: "per message", description: "relay" }), handler);
  // Error handler so a throwing handler gives a plain 500.
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { code: "handler_failed", message: "boom" } });
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/relay`;
  return { biz, agent, seller, client, handler, url };
}

async function credential(agentKey: string, sellerId: string, maxMicros = usd("0.05")) {
  const res = await fetch(`${mock.url}/v1/credentials`, {
    method: "POST",
    headers: { authorization: `Bearer ${agentKey}`, "content-type": "application/json" },
    body: JSON.stringify({ sellerId, maxMicros }),
  });
  return ((await res.json()) as any).credential as { id: string; token: string };
}

async function call(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: "POST", headers });
  return { status: res.status, json: (await res.json()) as any };
}

/** Makes calls to POST /v1/charges fail; every other fetch passes through. */
function failCharges(fail: () => Promise<Response>) {
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url ?? String(input);
    return String(url).endsWith("/v1/charges") ? fail() : real(input, init);
  });
}

function paymentRequiredBody(sellerId: string) {
  return {
    error: { code: "payment_required", message: "Pay with Gaitway" },
    gaitway: { sellerId, priceMicros: PRICE, priceNote: "per message", apiBase: mock.url },
  };
}

describe("gaitwayExpress", () => {
  it("replies 402 with the payment-required body when there is no token; the handler does not run", async () => {
    const t = await setup();
    const r = await call(t.url);
    expect(r.status).toBe(402);
    expect(r.json).toEqual(paymentRequiredBody(t.seller.id));
    expect(t.handler).not.toHaveBeenCalled();
  });

  it("replies 402 for an invalid token; the handler does not run", async () => {
    const t = await setup();
    const other = mock.addSeller();
    const c = await credential(t.agent.apiKey, other.id);
    const r = await call(t.url, { "gaitway-token": c.token });
    expect(r.status).toBe(402);
    expect(r.json).toEqual(paymentRequiredBody(t.seller.id));
    expect(t.handler).not.toHaveBeenCalled();
    expect(mock.sellerBalance(other.id).owedMicros).toBe("0");
  });

  it("with a valid token, charges the price first and then runs the handler with req.gaitway", async () => {
    let owedWhenHandlerRan: string | undefined;
    const t = await setup({
      handler: (req, res) => {
        owedWhenHandlerRan = mock.sellerBalance(req.gaitway!.charge.sellerId).owedMicros;
        res.json({ ok: true, gaitway: req.gaitway });
      },
    });
    const c = await credential(t.agent.apiKey, t.seller.id);
    const r = await call(t.url, { "gaitway-token": c.token });
    expect(r.status).toBe(200);
    expect(t.handler).toHaveBeenCalledTimes(1);
    expect(owedWhenHandlerRan).toBe(PRICE);
    const g = r.json.gaitway;
    expect(g.claims.credentialId).toBe(c.id);
    expect(g.claims.agentId).toBe(t.agent.id);
    expect(g.charge.amountMicros).toBe(PRICE);
    expect(g.charge.credentialId).toBe(c.id);
    expect(g.charge.description).toBe("relay");
    expect(g.remainingMicros).toBe(usd("0.04"));
  });

  it("replies 402 when the charge is refused for amount_exceeds_remaining; the handler does not run", async () => {
    const t = await setup();
    const c = await credential(t.agent.apiKey, t.seller.id, "5000"); // below the price
    const r = await call(t.url, { "gaitway-token": c.token });
    expect(r.status).toBe(402);
    expect(r.json).toEqual(paymentRequiredBody(t.seller.id));
    expect(t.handler).not.toHaveBeenCalled();
  });

  it("replies 402 when the charge is refused for credential_expired; the handler does not run", async () => {
    const t = await setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    // The token still verifies locally (real clock), but the API's clock says it has expired.
    mock.advanceTime(301_000);
    const r = await call(t.url, { "gaitway-token": c.token });
    expect(r.status).toBe(402);
    expect(r.json.error.code).toBe("payment_required");
    expect(t.handler).not.toHaveBeenCalled();
    mock.advanceTime(-301_000);
  });

  it("uses gaitway-request-id as the idempotency key, so a retried request is charged once", async () => {
    let calls = 0;
    const t = await setup({
      handler: (req, res) => {
        calls++;
        if (calls === 1) throw new Error("handler failed after the charge");
        res.json({ ok: true, gaitway: req.gaitway });
      },
    });
    const c = await credential(t.agent.apiKey, t.seller.id);
    const headers = { "gaitway-token": c.token, "gaitway-request-id": "req_retry_1" };
    const first = await call(t.url, headers);
    expect(first.status).toBe(500);
    const second = await call(t.url, headers);
    expect(second.status).toBe(200);
    expect(mock.credential(c.id).remainingMicros).toBe(usd("0.04"));
    expect(mock.sellerBalance(t.seller.id).owedMicros).toBe(PRICE);

    // A different request id is a new request and is charged again.
    const third = await call(t.url, { "gaitway-token": c.token, "gaitway-request-id": "req_retry_2" });
    expect(third.status).toBe(200);
    expect(mock.credential(c.id).remainingMicros).toBe(usd("0.03"));
  });

  it("without gaitway-request-id, each request is charged", async () => {
    const t = await setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    await call(t.url, { "gaitway-token": c.token });
    await call(t.url, { "gaitway-token": c.token });
    expect(mock.credential(c.id).remainingMicros).toBe(usd("0.03"));
  });

  it("replies 502 when the API cannot be reached; the handler does not run", async () => {
    const t = await setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    // Warm the JWKS cache, then point charges at a dead API.
    await t.client.verify(c.token);
    failCharges(() => Promise.reject(new TypeError("fetch failed")));
    const r = await call(t.url, { "gaitway-token": c.token });
    vi.restoreAllMocks();
    expect(r.status).toBe(502);
    expect(typeof r.json.error.code).toBe("string");
    expect(t.handler).not.toHaveBeenCalled();
  });

  it("replies 502 when the API answers 5xx; the handler does not run", async () => {
    const t = await setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    await t.client.verify(c.token);
    failCharges(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "internal_error", message: "db down" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const r = await call(t.url, { "gaitway-token": c.token });
    vi.restoreAllMocks();
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe("upstream_error");
    expect(t.handler).not.toHaveBeenCalled();
  });

  it("replies 502 when the JWKS cannot be fetched; the handler does not run", async () => {
    const t = await setup({ baseUrl: "http://127.0.0.1:1" });
    const c = await credential(t.agent.apiKey, t.seller.id);
    const r = await call(t.url, { "gaitway-token": c.token });
    expect(r.status).toBe(502);
    expect(t.handler).not.toHaveBeenCalled();
  });
});
