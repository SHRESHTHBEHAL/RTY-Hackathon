import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./client";
import { GaitwayError } from "./errors";
import { FIXTURE_LOGINS, fixtureSeedInfo, resetFixtures } from "./fixtures";

async function businessSession() {
  const { sessionToken } = await api(null, { mode: "fixtures" }).createSession(FIXTURE_LOGINS.business);
  return api(sessionToken, { mode: "fixtures" });
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(GaitwayError);
    return (e as GaitwayError).code;
  }
  throw new Error("expected the call to fail");
}

describe("fixture mode", () => {
  beforeEach(() => resetFixtures());

  it("seeds Acme Ops with Scout $50, Buyer $30, Broke $0 and $20 unallocated", async () => {
    const gw = await businessSession();
    const { data: agents } = await gw.listAgents();
    expect(agents.map((a) => a.name).sort()).toEqual(["Broke", "Buyer", "Scout"]);
    const bal = await gw.getBalance();
    expect(bal.unallocatedMicros).toBe("20000000");
    const byAgent = Object.fromEntries(
      bal.wallets.map((w) => [agents.find((a) => a.id === w.agentId)!.name, w.availableMicros]),
    );
    expect(byAgent).toEqual({ Scout: "50000000", Buyer: "30000000", Broke: "0" });
    expect(bal.wallets.every((w) => w.heldMicros === "0")).toBe(true);
  });

  it("createAgent then listAgents includes the new agent", async () => {
    const gw = await businessSession();
    const { agent, apiKey } = await gw.createAgent({ name: "Courier" });
    expect(agent.id).toMatch(/^agt_[0-9a-z]{24}$/);
    expect(agent.walletId).toMatch(/^wal_[0-9a-z]{24}$/);
    expect(apiKey).toMatch(/^gw_test_agt_[0-9a-z]{32}$/);
    const { data } = await gw.listAgents();
    expect(data.map((a) => a.id)).toContain(agent.id);
    expect(data[0]!.id).toBe(agent.id); // newest first
  });

  it("allocate beyond unallocated throws insufficient_funds and changes nothing", async () => {
    const gw = await businessSession();
    const wallets = fixtureSeedInfo().wallets;
    const err = gw.allocate({ walletId: wallets.broke, amountMicros: "20000001", direction: "to_wallet" });
    await expect(err).rejects.toMatchObject({ code: "insufficient_funds", status: 402 });
    expect((await gw.getBalance()).unallocatedMicros).toBe("20000000");
    const ok = await gw.allocate({ walletId: wallets.broke, amountMicros: "5000000", direction: "to_wallet" });
    expect(ok.unallocatedMicros).toBe("15000000");
    expect(ok.wallet.availableMicros).toBe("5000000");
  });

  it("rejects missing or wrong sessions with unauthorized, and wrong kind with forbidden", async () => {
    expect(await codeOf(api(null, { mode: "fixtures" }).listAgents())).toBe("unauthorized");
    expect(await codeOf(api("gws_nope", { mode: "fixtures" }).getMe())).toBe("unauthorized");
    expect(await codeOf(api(null, { mode: "fixtures" }).createSession({ email: FIXTURE_LOGINS.business.email, password: "wrong" }))).toBe(
      "unauthorized",
    );
    const { sessionToken } = await api(null, { mode: "fixtures" }).createSession(FIXTURE_LOGINS.seller);
    expect(await codeOf(api(sessionToken, { mode: "fixtures" }).listAgents())).toBe("forbidden");
  });

  it("validates input with validation_failed and a field", async () => {
    const pub = api(null, { mode: "fixtures" });
    await expect(pub.createAccount({ email: "x@y.test", password: "short", name: "X", kind: "business" })).rejects.toMatchObject({
      code: "validation_failed",
      details: { field: "password" },
    });
    await expect(
      pub.createAccount({ email: FIXTURE_LOGINS.business.email, password: "long-enough", name: "X", kind: "business" }),
    ).rejects.toMatchObject({ code: "validation_failed", details: { field: "email" } });
  });

  it("runs a credential and charge journey with the contract's rules", async () => {
    const info = fixtureSeedInfo();
    const agent = api(info.keys.agents[0], { mode: "fixtures" }); // Scout, $50
    const seller = api(info.keys.seller, { mode: "fixtures" });
    const broke = api(info.keys.agents[2], { mode: "fixtures" });

    expect(await codeOf(broke.createCredential({ sellerId: info.sellerId, maxMicros: "10000" }))).toBe("insufficient_funds");

    const { credential } = await agent.createCredential({ sellerId: info.sellerId, maxMicros: "30000" });
    expect(credential.token).toBeTruthy();
    expect((await agent.getWallet()).wallet).toMatchObject({ availableMicros: "49970000", heldMicros: "30000" });

    const before = await seller.getSellerBalance();
    const first = await seller.createCharge({ credentialId: credential.id, amountMicros: "10000" }, "req-1");
    expect(first.remainingMicros).toBe("20000");
    const again = await seller.createCharge({ credentialId: credential.id, amountMicros: "10000" }, "req-1");
    expect(again.charge.id).toBe(first.charge.id);
    expect(await codeOf(seller.createCharge({ credentialId: credential.id, amountMicros: "20000" }, "req-1"))).toBe(
      "idempotency_conflict",
    );
    expect(await codeOf(seller.createCharge({ credentialId: credential.id, amountMicros: "30000" }))).toBe(
      "amount_exceeds_remaining",
    );
    const after = await seller.getSellerBalance();
    expect(BigInt(after.owedMicros) - BigInt(before.owedMicros)).toBe(10000n);

    await seller.createCharge({ credentialId: credential.id, amountMicros: "10000", final: true });
    const { credential: closed } = await seller.getCredential(credential.id);
    expect(closed.status).toBe("released");
    expect(await codeOf(seller.createCharge({ credentialId: credential.id, amountMicros: "1" }))).toBe("credential_not_active");
    expect((await agent.getWallet()).wallet).toMatchObject({ availableMicros: "49980000", heldMicros: "0" });
  });

  it("serves the seller Relay with charges and payouts", async () => {
    const { sessionToken } = await api(null, { mode: "fixtures" }).createSession(FIXTURE_LOGINS.seller);
    const gw = api(sessionToken, { mode: "fixtures" });
    const charges = await gw.listCharges({ limit: 200 });
    expect(charges.data).toHaveLength(200);
    expect(charges.nextCursor).toBeNull();
    const payouts = await gw.listPayouts();
    expect(payouts.data.length).toBe(3);
    const bal = await gw.getSellerBalance();
    const paid = payouts.data.reduce((t, p) => t + BigInt(p.amountMicros), 0n);
    expect(BigInt(bal.paidOutMicros)).toBe(paid);
    expect(BigInt(bal.owedMicros) + paid).toBe(2_000_000n);
    const { data: services } = await gw.listServices();
    expect(services[0]!.name).toBe("Relay messages");
  });
});

describe("live mode", () => {
  let server: Server;
  let baseUrl: string;
  const seen: Array<{ method?: string; url?: string; auth?: string; idem?: string }> = [];

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      seen.push({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        idem: req.headers["idempotency-key"] as string | undefined,
      });
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/agents") {
        res.end(JSON.stringify({ data: [{ id: "agt_x", name: "X", walletId: "wal_x", status: "active", createdAt: "2026-11-18T00:00:00Z" }], nextCursor: null }));
      } else if (req.url === "/v1/allocations") {
        res.statusCode = 402;
        res.end(JSON.stringify({ error: { code: "insufficient_funds", message: "Not enough", details: { needed: "1" } } }));
      } else if (req.url === "/v1/charges") {
        res.statusCode = 201;
        res.end(JSON.stringify({ charge: { id: "chg_1" }, remainingMicros: "0" }));
      } else {
        res.statusCode = 500;
        res.end("not json");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("sends the Bearer token and returns typed data", async () => {
    const gw = api("gws_live_test_token", { mode: "live", baseUrl });
    const { data } = await gw.listAgents();
    expect(data[0]!.name).toBe("X");
    expect(seen.at(-1)).toMatchObject({ method: "GET", url: "/v1/agents", auth: "Bearer gws_live_test_token" });
  });

  it("maps an error body to GaitwayError with code, status and details", async () => {
    const gw = api("gws_t", { mode: "live", baseUrl });
    const p = gw.allocate({ walletId: "wal_x", amountMicros: "1", direction: "to_wallet" });
    await expect(p).rejects.toBeInstanceOf(GaitwayError);
    await expect(gw.allocate({ walletId: "wal_x", amountMicros: "1", direction: "to_wallet" })).rejects.toMatchObject({
      code: "insufficient_funds",
      status: 402,
      details: { needed: "1" },
    });
  });

  it("sends an Idempotency-Key on charges", async () => {
    await api("gw_test_sel_x", { mode: "live", baseUrl }).createCharge({ credentialId: "crd_1", amountMicros: "1" }, "abc");
    expect(seen.at(-1)).toMatchObject({ url: "/v1/charges", idem: "abc" });
  });

  it("turns a non-JSON body and an unreachable server into GaitwayError", async () => {
    await expect(api("t", { mode: "live", baseUrl }).getMe()).rejects.toMatchObject({ code: "bad_response", status: 500 });
    await expect(api("t", { mode: "live", baseUrl: "http://127.0.0.1:1" }).getMe()).rejects.toMatchObject({ code: "network_error" });
  });
});
