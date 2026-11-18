import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GaitwaySeller, usd } from "@gaitway/sdk";
import { gaitwayExpress } from "@gaitway/sdk/express";
import { startMockGaitway, type MockGaitway } from "@gaitway/sdk/testing";
import { createServer } from "../src/server.js";

let mock: MockGaitway;
const httpServers: Server[] = [];
const clients: Client[] = [];
/** Every text the server ever returned to a client, so secrecy tests can search all of it. */
const allTexts: string[] = [];

beforeAll(async () => {
  mock = await startMockGaitway();
});
afterEach(async () => {
  while (clients.length) await clients.pop()!.close();
});
afterAll(async () => {
  await Promise.all(
    httpServers.map((s) => new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); })),
  );
  await mock.close();
});

type Result = { text: string; isError: boolean };

async function startSeller(price = usd("0.01")) {
  const rec = mock.addSeller({ name: "Relay Co" });
  const seller = new GaitwaySeller({ apiKey: rec.apiKey, sellerId: rec.id, baseUrl: mock.url });
  const seen: { token: string | undefined }[] = [];
  const app = express();
  app.use(express.json());
  app.post("/relay", gaitwayExpress(seller, { priceMicros: price, priceNote: "per message" }), (req, res) => {
    seen.push({ token: req.get("gaitway-token") });
    res.json({ ok: true, echo: req.body });
  });
  // Echoes the credential token back in the body, as a careless seller might.
  app.post("/leaky", gaitwayExpress(seller, { priceMicros: price }), (req, res) => {
    res.json({ youSent: req.get("gaitway-token") });
  });
  app.post("/big", gaitwayExpress(seller, { priceMicros: price }), (_req, res) => {
    res.type("text/plain").send("x".repeat(30_000));
  });
  app.get("/free", (_req, res) => { res.json({ free: true }); });
  // Answers 402 even to a valid credential.
  app.post("/never", (_req, res) => {
    res.status(402).json({
      error: { code: "payment_required", message: "no" },
      gaitway: { sellerId: rec.id, priceMicros: price, priceNote: null, apiBase: mock.url },
    });
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  httpServers.push(server);
  return { rec, seen, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function setup(opts: { balance?: string; maxSessionDollars?: string; agentKey?: string } = {}) {
  const biz = mock.addBusiness();
  const agentRec = mock.addAgent(biz.id, opts.balance ?? usd("10"), "Scout");
  const seller = await startSeller();
  const server = createServer({
    agentKey: opts.agentKey ?? agentRec.apiKey,
    apiBase: mock.url,
    ...(opts.maxSessionDollars ? { maxSessionDollars: opts.maxSessionDollars } : {}),
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  clients.push(client);
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
    const res = (await client.callTool({ name, arguments: args })) as {
      content: { type: string; text?: string }[]; isError?: boolean;
    };
    const text = res.content.map((c) => c.text ?? "").join("\n");
    allTexts.push(text);
    return { text, isError: res.isError === true };
  };
  return { biz, agentRec, seller, client, call };
}

describe("tool list", () => {
  it("exposes the five tools with their inputs", async () => {
    const t = await setup();
    const { tools } = await t.client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([
      "gaitway_balance", "gaitway_find_sellers", "gaitway_paid_request", "gaitway_pay_seller", "gaitway_payments",
    ]);
    const props = (n: string) =>
      Object.keys((tools.find((x) => x.name === n)!.inputSchema as { properties?: object }).properties ?? {}).sort();
    expect(props("gaitway_balance")).toEqual([]);
    expect(props("gaitway_find_sellers")).toEqual(["query"]);
    expect(props("gaitway_paid_request")).toEqual(["body", "max_dollars", "method", "url"]);
    expect(props("gaitway_pay_seller")).toEqual(["dollars", "reference", "seller_id"]);
    expect(props("gaitway_payments")).toEqual([]);
  });
});

describe("gaitway_balance", () => {
  it("shows available and held in dollars", async () => {
    const t = await setup({ balance: usd("12.5") });
    const r = await t.call("gaitway_balance");
    expect(r.isError).toBe(false);
    expect(r.text).toContain("$12.50");
    expect(r.text).toMatch(/available/i);
    expect(r.text).toMatch(/held/i);
    expect(r.text).not.toContain("12500000");
  });
  it("shows sub-cent amounts with up to six decimals", async () => {
    const t = await setup({ balance: "5000" });
    expect((await t.call("gaitway_balance")).text).toContain("$0.005");
  });
});

describe("gaitway_find_sellers", () => {
  it("lists matching sellers with ids and services, and nothing else", async () => {
    const t = await setup();
    mock.addService(t.seller.rec.id, {
      name: "Translate", description: "Machine translation", priceNote: "$0.01 per call",
      url: `${t.seller.origin}/relay`,
    });
    const r = await t.call("gaitway_find_sellers", { query: "relay" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain(t.seller.rec.id);
    expect(r.text).toContain("Relay Co");
    expect(r.text).toContain("Translate");
    expect(r.text).toContain("$0.01 per call");
    expect(r.text).toContain(`${t.seller.origin}/relay`);
    const none = await t.call("gaitway_find_sellers", { query: "zzz-no-such-seller" });
    expect(none.isError).toBe(false);
    expect(none.text).toMatch(/no sellers/i);
  });
});

describe("gaitway_paid_request", () => {
  it("performs the 402 flow and returns the status and body", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", {
      url: `${t.seller.origin}/relay`, method: "POST", body: JSON.stringify({ text: "hello" }),
    });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("HTTP 200");
    expect(r.text).toContain('"ok":true');
    expect(r.text).toContain("hello");
    expect(mock.sellerBalance(t.seller.rec.id).owedMicros).toBe(usd("0.01"));
    expect(t.seller.seen[0]!.token).toBeTruthy();
  });

  it("returns a free endpoint's response without paying", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/free`, method: "GET" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("HTTP 200");
    expect(r.text).toContain('"free":true');
    expect(mock.wallet(t.agentRec.id).availableMicros).toBe(usd("10"));
  });

  it("truncates a long body to 20,000 characters and says so", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/big`, method: "POST" });
    expect(r.isError).toBe(false);
    const xs = r.text.match(/x+/)![0];
    expect(xs.length).toBe(20_000);
    expect(r.text).toMatch(/truncated/i);
  });

  it("sizes the credential from max_dollars", async () => {
    const t = await setup();
    await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: "0.05" });
    const w = mock.wallet(t.agentRec.id);
    // one cent charged, the rest of the $0.05 credential is still held
    expect(w.heldMicros).toBe(usd("0.04"));
    expect(w.availableMicros).toBe(usd("9.95"));
  });

  it("refuses max_dollars above the session limit (default 5) before any money moves", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: "5.01" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/max_dollars/);
    expect(r.text).toContain("$5.00");
    expect(mock.wallet(t.agentRec.id).availableMicros).toBe(usd("10"));
    expect(t.seller.seen).toHaveLength(0);
    const ok = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: "5" });
    expect(ok.isError).toBe(false);
  });

  it("accepts a higher max_dollars when the server was started with a raised limit", async () => {
    const t = await setup({ maxSessionDollars: "8" });
    const refused = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: "8.5" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("$8.00");
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: "7" });
    expect(r.isError).toBe(false);
    expect(mock.wallet(t.agentRec.id).heldMicros).toBe(usd("6.99"));
  });

  it("rejects a malformed max_dollars with a clear error", async () => {
    const t = await setup();
    for (const bad of ["abc", "-1", "1e3", "0.1234567", "0"]) {
      const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: bad });
      expect(r.isError, bad).toBe(true);
      expect(r.text).toMatch(/max_dollars/);
    }
  });

  it("reports insufficient_funds as an error result", async () => {
    const t = await setup({ balance: "0" });
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("insufficient_funds");
  });

  it("reports rule_violation with the approval link", async () => {
    const t = await setup();
    mock.setPolicyOutcome(t.biz.id, { outcome: "hold", reasons: ["over limit"], approvalLink: "https://approve.example/abc123" });
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST" });
    mock.setPolicyOutcome(t.biz.id, null);
    expect(r.isError).toBe(true);
    expect(r.text).toContain("rule_violation");
    expect(r.text).toContain("https://approve.example/abc123");
  });

  it("reports payment_failed when the seller still answers 402 after paying", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/never`, method: "POST" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("payment_failed");
  });

  it("returns a non-402 HTTP error status as a normal result", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/missing`, method: "GET" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("HTTP 404");
  });

  it("reports an unreachable URL as an error result", async () => {
    const t = await setup();
    const r = await t.call("gaitway_paid_request", { url: "http://127.0.0.1:1/nope", method: "GET" });
    expect(r.isError).toBe(true);
  });
});

describe("gaitway_pay_seller", () => {
  it("transfers dollars to a seller and reports the amount", async () => {
    const t = await setup();
    const r = await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "1.25", reference: "invoice 42" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("$1.25");
    expect(r.text).toContain(t.seller.rec.id);
    expect(mock.sellerBalance(t.seller.rec.id).owedMicros).toBe(usd("1.25"));
    expect(mock.wallet(t.agentRec.id).availableMicros).toBe(usd("8.75"));
  });

  it("rejects malformed amounts without touching the wallet", async () => {
    const t = await setup();
    for (const bad of ["0", "-1", "1.2.3", "$1", "0.1234567", "", "NaN"]) {
      const r = await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: bad });
      expect(r.isError, bad).toBe(true);
      expect(r.text).toMatch(/dollars/);
    }
    expect(mock.wallet(t.agentRec.id).availableMicros).toBe(usd("10"));
  });

  it("refuses an amount above the session limit", async () => {
    const t = await setup();
    const r = await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "6" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("$5.00");
    expect(mock.wallet(t.agentRec.id).availableMicros).toBe(usd("10"));
  });

  it("reports insufficient_funds and rule_violation as error results", async () => {
    const t = await setup({ balance: usd("1") });
    const poor = await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "2" });
    expect(poor.isError).toBe(true);
    expect(poor.text).toContain("insufficient_funds");
    mock.setPolicyOutcome(t.biz.id, { outcome: "block", reasons: [], approvalLink: "https://approve.example/zzz" });
    const blocked = await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "0.5" });
    mock.setPolicyOutcome(t.biz.id, null);
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toContain("rule_violation");
    expect(blocked.text).toContain("https://approve.example/zzz");
  });
});

describe("gaitway_payments", () => {
  it("lists payments in dollars, and says so when there are none", async () => {
    const t = await setup();
    expect((await t.call("gaitway_payments")).text).toMatch(/no payments/i);
    await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "1.25", reference: "invoice 42" });
    await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST" });
    const r = await t.call("gaitway_payments");
    expect(r.isError).toBe(false);
    expect(r.text).toContain("$1.25");
    expect(r.text).toContain("$0.01");
    expect(r.text).toContain("invoice 42");
    expect(r.text).toContain(t.seller.rec.id);
  });
});

describe("secrets", () => {
  it("never shows the agent key or a credential token in any result or error", async () => {
    const t = await setup();
    const tokens: string[] = [];
    const start = allTexts.length;

    const leaked = await t.call("gaitway_paid_request", { url: `${t.seller.origin}/leaky`, method: "POST" });
    expect(leaked.isError).toBe(false);
    expect(leaked.text).toContain("[redacted]");

    await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", body: "{}" });
    await t.call("gaitway_paid_request", { url: `${t.seller.origin}/never`, method: "POST" });
    await t.call("gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST", max_dollars: "99" });
    await t.call("gaitway_balance");
    await t.call("gaitway_payments");
    await t.call("gaitway_find_sellers", { query: "relay" });
    await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "0.5" });
    await t.call("gaitway_pay_seller", { seller_id: t.seller.rec.id, dollars: "500" });
    await t.call("gaitway_pay_seller", { seller_id: "sel_missing", dollars: "0.5" });

    for (const s of t.seller.seen) if (s.token) tokens.push(s.token);
    expect(tokens.length).toBeGreaterThan(0);
    const texts = allTexts.slice(start);
    for (const text of texts) {
      expect(text).not.toContain(t.agentRec.apiKey);
      for (const tok of tokens) expect(text).not.toContain(tok);
      expect(text).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
    }
  });

  it("does not leak the key when the API rejects it (the seller directory is public, so not included)", async () => {
    const t = await setup({ agentKey: "gw_test_agt_notarealkey1234567890" });
    for (const [name, args] of [
      ["gaitway_balance", {}],
      ["gaitway_payments", {}],
      ["gaitway_pay_seller", { seller_id: "sel_x", dollars: "1" }],
      ["gaitway_paid_request", { url: `${t.seller.origin}/relay`, method: "POST" }],
    ] as const) {
      const r = await t.call(name, args as Record<string, unknown>);
      expect(r.isError, name).toBe(true);
      expect(r.text).not.toContain("notarealkey1234567890");
    }
  });

  it("redacts the agent key if a seller echoes it", async () => {
    const t = await setup();
    const echo = express();
    echo.get("/k", (_req, res) => { res.type("text/plain").send(`key=${t.agentRec.apiKey}`); });
    const server = await new Promise<Server>((resolve) => { const s = echo.listen(0, "127.0.0.1", () => resolve(s)); });
    httpServers.push(server);
    const r = await t.call("gaitway_paid_request", {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/k`, method: "GET",
    });
    expect(r.text).not.toContain(t.agentRec.apiKey);
    expect(r.text).toContain("[redacted]");
  });
});
