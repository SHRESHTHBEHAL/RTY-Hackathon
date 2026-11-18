import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { startMockGaitway, type MockGaitway } from "../src/testing/mock-gaitway.js";
import { GaitwayAgent, GaitwayError, GaitwaySeller, usd } from "../src/index.js";
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
afterEach(() => {
  vi.restoreAllMocks();
});

const PRICE = usd("0.01");

type Hit = { requestId: string | undefined; token: string | undefined; body: unknown };

/** A tiny paid seller: POST /relay costs PRICE. Records every request it receives. */
async function setup(opts: { balance?: string; sessionMicros?: string; price?: string } = {}) {
  const biz = mock.addBusiness({ name: "Acme" });
  const agentRec = mock.addAgent(biz.id, opts.balance ?? usd("1"), "Scout");
  const sellerRec = mock.addSeller();
  const seller = new GaitwaySeller({ apiKey: sellerRec.apiKey, sellerId: sellerRec.id, baseUrl: mock.url });
  const hits: Hit[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    hits.push({ requestId: req.get("gaitway-request-id"), token: req.get("gaitway-token"), body: req.body });
    next();
  });
  app.post("/relay", gaitwayExpress(seller, { priceMicros: opts.price ?? PRICE, priceNote: "per message" }), (req, res) => {
    res.json({ ok: true, echo: req.body, chargeId: req.gaitway!.charge.id });
  });
  app.get("/plain-402", (_req, res) => {
    res.status(402).json({ error: { code: "payment_required", message: "Pay some other way" } });
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const agent = new GaitwayAgent({
    apiKey: agentRec.apiKey,
    baseUrl: mock.url,
    ...(opts.sessionMicros ? { sessionMicros: opts.sessionMicros } : {}),
  });
  return { agentRec, sellerRec, agent, hits, origin, url: `${origin}/relay` };
}

/** Pass-through spy on global fetch that counts credential creations. */
function countCredentialCreations() {
  const real = globalThis.fetch;
  const counter = { n: 0 };
  vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url ?? String(input);
    if (String(url).endsWith("/v1/credentials") && (init?.method ?? "GET") === "POST") counter.n++;
    return real(input, init);
  });
  return counter;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("GaitwayAgent.fetch", () => {
  it("pays on a 402: creates a credential for sessionMicros, retries with gaitway-token, returns the 200", async () => {
    const t = await setup({ sessionMicros: usd("0.05") });
    const res = await t.agent.fetch(t.url, post({ msg: "hello" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.echo).toEqual({ msg: "hello" });

    expect(t.hits).toHaveLength(2);
    expect(t.hits[0]!.token).toBeUndefined();
    expect(typeof t.hits[1]!.token).toBe("string");
    expect(t.hits[1]!.body).toEqual({ msg: "hello" }); // body re-sent on the retry

    const w = mock.wallet(t.agentRec.id);
    expect(w.heldMicros).toBe(usd("0.04")); // 0.05 held, 0.01 charged
    expect(w.availableMicros).toBe(usd("0.95"));
    expect(mock.sellerBalance(t.sellerRec.id).owedMicros).toBe(PRICE);
  });

  it("defaults sessionMicros to one dollar", async () => {
    const t = await setup({ balance: usd("5") });
    await t.agent.fetch(t.url, post({}));
    expect(mock.wallet(t.agentRec.id).heldMicros).toBe(usd("0.99"));
  });

  it("reuses the open credential for the same seller: no new credential, token sent up front", async () => {
    const t = await setup({ sessionMicros: usd("0.05") });
    const counter = countCredentialCreations();
    expect((await t.agent.fetch(t.url, post({ n: 1 }))).status).toBe(200);
    expect((await t.agent.fetch(t.url, post({ n: 2 }))).status).toBe(200);
    expect((await t.agent.fetch(t.url, post({ n: 3 }))).status).toBe(200);
    expect(counter.n).toBe(1);
    // First call: 402 then paid retry. Later calls: one request each, carrying the same token.
    expect(t.hits).toHaveLength(4);
    expect(t.hits[2]!.token).toBe(t.hits[1]!.token);
    expect(t.hits[3]!.token).toBe(t.hits[1]!.token);
    expect(mock.sellerBalance(t.sellerRec.id).owedMicros).toBe(usd("0.03"));
  });

  it("when the credential is exhausted, the next fetch creates a new one and succeeds", async () => {
    const t = await setup({ sessionMicros: usd("0.02") });
    const counter = countCredentialCreations();
    await t.agent.fetch(t.url, post({ n: 1 }));
    await t.agent.fetch(t.url, post({ n: 2 })); // exhausts the 0.02 credential
    const firstToken = t.hits[1]!.token;
    const res = await t.agent.fetch(t.url, post({ n: 3 }));
    expect(res.status).toBe(200);
    expect(counter.n).toBe(2);
    const last = t.hits[t.hits.length - 1]!;
    expect(last.token).toBeDefined();
    expect(last.token).not.toBe(firstToken);
    expect(mock.sellerBalance(t.sellerRec.id).owedMicros).toBe(usd("0.03"));
  });

  it("when the credential is expired, the next fetch creates a new one and succeeds", async () => {
    const t = await setup({ sessionMicros: usd("0.05") });
    const counter = countCredentialCreations();
    await t.agent.fetch(t.url, post({ n: 1 }));
    mock.advanceTime(301_000); // the API now considers the credential expired
    try {
      const res = await t.agent.fetch(t.url, post({ n: 2 }));
      expect(res.status).toBe(200);
      expect(counter.n).toBe(2);
      expect(mock.sellerBalance(t.sellerRec.id).owedMicros).toBe(usd("0.02"));
    } finally {
      mock.advanceTime(-301_000);
    }
  });

  it("a second 402 after paying throws payment_failed and makes no third attempt", async () => {
    // The session is smaller than the price, so the paid retry is refused too.
    const t = await setup({ sessionMicros: "5000" });
    const err = await t.agent.fetch(t.url, post({})).catch((e) => e);
    expect(err).toBeInstanceOf(GaitwayError);
    expect((err as GaitwayError).code).toBe("payment_failed");
    expect(t.hits).toHaveLength(2);
    // The refused credential's hold is released, not left stuck.
    expect(mock.wallet(t.agentRec.id).heldMicros).toBe("0");
  });

  it("a second 402 after a cached credential failed is also final: one retry in total", async () => {
    const t = await setup({ sessionMicros: usd("0.01") });
    await t.agent.fetch(t.url, post({})); // exhausts the credential
    // Make the next credential too small by draining the wallet to below the price.
    const w = mock.wallet(t.agentRec.id);
    expect(w.availableMicros).toBe(usd("0.99"));
    const drain = new GaitwayAgent({ apiKey: t.agentRec.apiKey, baseUrl: mock.url });
    await drain.createCredential({ sellerId: t.sellerRec.id, maxMicros: (BigInt(w.availableMicros) - 5000n).toString() });
    const before = t.hits.length;
    const err = await t.agent.fetch(t.url, post({})).catch((e) => e);
    expect((err as GaitwayError).code).toBe("payment_failed");
    expect(t.hits.length - before).toBe(2);
  });

  it("returns a 402 without a gaitway object untouched", async () => {
    const t = await setup();
    const counter = countCredentialCreations();
    const res = await t.agent.fetch(`${t.origin}/plain-402`);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: "payment_required", message: "Pay some other way" } });
    expect(counter.n).toBe(0);
    expect(t.hits).toHaveLength(1);
  });

  it("sends one gaitway-request-id per logical call, the same on the retry", async () => {
    const t = await setup({ sessionMicros: usd("0.05") });
    await t.agent.fetch(t.url, post({ n: 1 }));
    await t.agent.fetch(t.url, post({ n: 2 }));
    const [a, b, c] = t.hits.map((h) => h.requestId);
    expect(a).toMatch(/.{16,}/);
    expect(b).toBe(a);
    expect(c).toMatch(/.{16,}/);
    expect(c).not.toBe(a);
  });

  it("remembers sellers by origin and attaches the credential up front", async () => {
    const t = await setup({ sessionMicros: usd("0.05") });
    await t.agent.fetch(t.url, post({ n: 1 }));
    // A different path on the same origin gets the credential up front.
    const res = await t.agent.fetch(`${t.origin}/plain-402?x=1`, { headers: { "x-custom": "yes" } });
    expect(res.status).toBe(402);
    expect(t.hits[2]!.token).toBe(t.hits[1]!.token);
  });

  it("refuses a stream body, which cannot be re-sent", async () => {
    const t = await setup();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x")); c.close(); } });
    const err = await t.agent.fetch(t.url, { method: "POST", body: stream, duplex: "half" } as RequestInit).catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(t.hits).toHaveLength(0);
  });

  it("when sessionMicros exceeds the balance, opens the session for the whole available balance", async () => {
    const t = await setup({ balance: usd("0.03"), sessionMicros: usd("1") });
    const res = await t.agent.fetch(t.url, post({}));
    expect(res.status).toBe(200);
    const w = mock.wallet(t.agentRec.id);
    expect(w.availableMicros).toBe("0");
    expect(w.heldMicros).toBe(usd("0.02"));
  });

  it("opts.maxMicros overrides sessionMicros for this call's credential", async () => {
    const t = await setup({ sessionMicros: usd("1") });
    await t.agent.fetch(t.url, post({}), { maxMicros: usd("0.10") });
    expect(mock.wallet(t.agentRec.id).heldMicros).toBe(usd("0.09"));
  });

  it("with zero balance, throws insufficient_funds", async () => {
    const t = await setup({ balance: "0" });
    const err = await t.agent.fetch(t.url, post({})).catch((e) => e);
    expect(err).toBeInstanceOf(GaitwayError);
    expect((err as GaitwayError).code).toBe("insufficient_funds");
    expect(t.hits).toHaveLength(1);
  });
});

describe("GaitwayAgent API methods", () => {
  it("balance, createCredential, release, payments", async () => {
    const t = await setup();
    expect(await t.agent.balance()).toMatchObject({ agentId: t.agentRec.id, availableMicros: usd("1"), heldMicros: "0" });
    const c = await t.agent.createCredential({ sellerId: t.sellerRec.id, maxMicros: usd("0.10"), ttlSeconds: 60 });
    expect(c.token).toBeTypeOf("string");
    expect((await t.agent.balance()).heldMicros).toBe(usd("0.10"));
    const r = await t.agent.release(c.id);
    expect(r.status).toBe("released");
    expect((await t.agent.balance()).heldMicros).toBe("0");

    await t.agent.fetch(t.url, post({}));
    await t.agent.fetch(t.url, post({}));
    const payments = await t.agent.payments();
    expect(payments).toHaveLength(2);
    expect(payments.every((p) => p.agentId === t.agentRec.id && p.amountMicros === PRICE)).toBe(true);
  });

  it("releaseAll releases every open credential and the held balance returns to zero", async () => {
    const t = await setup({ sessionMicros: usd("0.05") });
    const other = await setup(); // a second seller, same mock
    const agent = new GaitwayAgent({ apiKey: t.agentRec.apiKey, baseUrl: mock.url, sessionMicros: usd("0.05") });
    await agent.fetch(t.url, post({}));
    await agent.fetch(other.url, post({}));
    const manual = await agent.createCredential({ sellerId: t.sellerRec.id, maxMicros: usd("0.10") });
    // One already finished: releasing it again must not fail releaseAll.
    await agent.release(manual.id);
    const extra = await agent.createCredential({ sellerId: other.sellerRec.id, maxMicros: usd("0.01") });
    await mockRelease(t.agentRec.apiKey, extra.id); // finished behind the SDK's back
    expect(BigInt(mock.wallet(t.agentRec.id).heldMicros)).toBeGreaterThan(0n);

    await agent.releaseAll();
    expect(mock.wallet(t.agentRec.id).heldMicros).toBe("0");
    // Afterwards the next fetch opens a fresh session.
    expect((await agent.fetch(t.url, post({}))).status).toBe(200);
  });
});

async function mockRelease(apiKey: string, id: string) {
  await fetch(`${mock.url}/v1/credentials/${id}/release`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` } });
}
