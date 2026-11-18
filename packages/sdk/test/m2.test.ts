import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { startMockGaitway, type MockGaitway } from "../src/testing/mock-gaitway.js";
import { GaitwayAgent, GaitwayError, GaitwaySeller, usd } from "../src/index.js";

let mock: MockGaitway;
beforeAll(async () => {
  mock = await startMockGaitway();
});
afterAll(async () => {
  await mock.close();
});

async function call(method: string, path: string, key: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(mock.url + path, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
}

function setup(balance = usd("1")) {
  const biz = mock.addBusiness({ name: "Acme", email: "ops@acme.test", verified: true });
  const agentRec = mock.addAgent(biz.id, balance, "Scout");
  const sellerRec = mock.addSeller({ name: "Relay Co" });
  const agent = new GaitwayAgent({ apiKey: agentRec.apiKey, baseUrl: mock.url });
  const seller = new GaitwaySeller({ apiKey: sellerRec.apiKey, sellerId: sellerRec.id, baseUrl: mock.url });
  return { biz, agentRec, sellerRec, agent, seller };
}

async function rejection(p: Promise<unknown>): Promise<GaitwayError> {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(GaitwayError);
  return err as GaitwayError;
}

describe("sellers directory", () => {
  it("findSellers lists sellers with their services and filters by query", async () => {
    const { agent } = setup();
    const tag = `zebra${Date.now()}`;
    const s = mock.addSeller({ name: `${tag} Translations` });
    const svc = mock.addService(s.id, { name: "Translate", description: "Any language", priceNote: "per page", url: "https://t.example" });
    const other = mock.addSeller({ name: "Unrelated" });
    mock.addService(other.id, { name: `${tag}-maps`, description: "Maps" });

    const all = await agent.findSellers();
    expect(all.map((x) => x.id)).toEqual(expect.arrayContaining([s.id, other.id]));

    const hits = await agent.findSellers(tag);
    expect(hits.map((x) => x.id).sort()).toEqual([s.id, other.id].sort());
    const mine = hits.find((x) => x.id === s.id)!;
    expect(mine).toEqual({ id: s.id, name: `${tag} Translations`, services: [svc] });
    expect(svc).toMatchObject({ sellerId: s.id, name: "Translate", priceNote: "per page", active: true });
    expect(svc.id).toMatch(/^svc_[a-z0-9]{24}$/);

    expect(await agent.findSellers(`${tag}-maps`)).toHaveLength(1);
    expect(await agent.findSellers("nothing-matches-this-xyz")).toEqual([]);
  });

  it("GET /v1/sellers is public and paginated", async () => {
    mock.addSeller();
    const r = await call("GET", "/v1/sellers?limit=1", null);
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(1);
    expect(typeof r.json.nextCursor).toBe("string");
  });

  it("getSeller returns one seller; unknown is not_found", async () => {
    const { agent, sellerRec } = setup();
    const svc = mock.addService(sellerRec.id, { name: "Relay" });
    expect(await agent.getSeller(sellerRec.id)).toEqual({ id: sellerRec.id, name: "Relay Co", services: [svc] });
    const err = await rejection(agent.getSeller("sel_" + "z".repeat(24)));
    expect([err.code, err.status]).toEqual(["not_found", 404]);
  });
});

describe("mandates", () => {
  it("createMandate returns a mandate whose token has the section 7 shape", async () => {
    const { biz, agentRec, sellerRec, agent } = setup();
    const m = await agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: usd("5"), period: "month" });
    expect(m.id).toMatch(/^mdt_[a-z0-9]{24}$/);
    expect(m).toMatchObject({
      walletId: agentRec.walletId, agentId: agentRec.id, sellerId: sellerRec.id,
      maxPerPeriodMicros: "5000000", period: "month", status: "active",
    });
    expect(typeof m.token).toBe("string");
    expect(decodeProtectedHeader(m.token!).typ).toBe("gaitway-mandate+jwt");
    const { payload } = await jwtVerify(m.token!, createLocalJWKSet(mock.jwks), { audience: sellerRec.id, issuer: mock.url });
    expect(payload).toMatchObject({
      sub: agentRec.id, jti: m.id, env: "test", cur: "USD", maxPerPeriod: "5000000", period: "month",
      biz: { id: biz.id, name: "Acme", email: "ops@acme.test", verified: true },
      agent: { id: agentRec.id, name: "Scout" },
    });
    expect(payload.max).toBeUndefined();
    expect(payload.exp! - payload.iat!).toBe(365 * 24 * 3600);
  });

  it("createMandate validates input", async () => {
    const { sellerRec, agent } = setup();
    const err = await rejection(agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: "100", period: "year" as any }));
    expect(err.code).toBe("validation_failed");
  });

  it("verifyMandate returns claims; rejects credentials and other sellers' mandates", async () => {
    const { biz, agentRec, sellerRec, agent, seller } = setup();
    const m = await agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: usd("1"), period: "week" });
    const claims = await seller.verifyMandate(m.token!);
    expect(claims).toMatchObject({
      mandateId: m.id, agentId: agentRec.id, agentName: "Scout",
      business: { id: biz.id, name: "Acme", email: "ops@acme.test", verified: true },
      maxPerPeriodMicros: "1000000", period: "week", env: "test",
    });
    expect(claims.expiresAt).toBeInstanceOf(Date);

    const cred = await agent.createCredential({ sellerId: sellerRec.id, maxMicros: "100" });
    expect((await rejection(seller.verifyMandate(cred.token!))).code).toBe("invalid_mandate");
    // and a mandate is not accepted as a credential
    expect((await rejection(seller.verify(m.token!))).code).toBe("invalid_credential");

    const other = mock.addSeller();
    const m2 = await agent.createMandate({ sellerId: other.id, maxPerPeriodMicros: "100", period: "day" });
    expect((await rejection(seller.verifyMandate(m2.token!))).code).toBe("invalid_mandate");
    expect((await rejection(seller.verifyMandate("garbage"))).code).toBe("invalid_mandate");
  });

  it("chargeMandate takes money from the available balance, up to the period limit", async () => {
    const { agentRec, sellerRec, agent, seller } = setup(usd("1"));
    const m = await agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: usd("0.3"), period: "day" });
    const c = await seller.chargeMandate({ mandateId: m.id, amountMicros: usd("0.2"), description: "sub" });
    expect(c).toMatchObject({
      credentialId: null, mandateId: m.id, sellerId: sellerRec.id, agentId: agentRec.id,
      amountMicros: "200000", refundedMicros: "0", description: "sub",
    });
    expect(mock.wallet(agentRec.id)).toMatchObject({ availableMicros: "800000", heldMicros: "0" });
    expect(mock.sellerBalance(sellerRec.id).owedMicros).toBe("200000");

    const over = await rejection(seller.chargeMandate({ mandateId: m.id, amountMicros: usd("0.11") }));
    expect([over.code, over.status]).toEqual(["amount_exceeds_remaining", 409]);
    await seller.chargeMandate({ mandateId: m.id, amountMicros: usd("0.1") });

    mock.advanceTime(24 * 3600 * 1000); // next UTC day: a fresh period
    await seller.chargeMandate({ mandateId: m.id, amountMicros: usd("0.3") });
    expect(mock.wallet(agentRec.id).availableMicros).toBe("400000");
  });

  it("chargeMandate is idempotent and checks seller, funds, and status", async () => {
    const { sellerRec, agent, seller } = setup("50000");
    const m = await agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: usd("1"), period: "month" });
    const a = await seller.chargeMandate({ mandateId: m.id, amountMicros: "10000", idempotencyKey: "mk1" });
    const b = await seller.chargeMandate({ mandateId: m.id, amountMicros: "10000", idempotencyKey: "mk1" });
    expect(b).toEqual(a);
    expect(mock.sellerBalance(sellerRec.id).owedMicros).toBe("10000");
    const conflict = await rejection(seller.chargeMandate({ mandateId: m.id, amountMicros: "20000", idempotencyKey: "mk1" }));
    expect(conflict.code).toBe("idempotency_conflict");

    const poor = await rejection(seller.chargeMandate({ mandateId: m.id, amountMicros: "50000" }));
    expect([poor.code, poor.status]).toEqual(["insufficient_funds", 402]);

    const otherRec = mock.addSeller();
    const other = new GaitwaySeller({ apiKey: otherRec.apiKey, sellerId: otherRec.id, baseUrl: mock.url });
    expect((await rejection(other.chargeMandate({ mandateId: m.id, amountMicros: "1" }))).code).toBe("forbidden");

    mock.revokeMandate(m.id);
    expect((await rejection(seller.chargeMandate({ mandateId: m.id, amountMicros: "1" }))).code).toBe("credential_not_active");
  });

  it("chargeMandate validates input locally", async () => {
    const { seller } = setup();
    expect((await rejection(seller.chargeMandate({ mandateId: "", amountMicros: "1" }))).code).toBe("validation_failed");
    expect((await rejection(seller.chargeMandate({ mandateId: "mdt_x", amountMicros: "1.5" }))).code).toBe("validation_failed");
  });
});

describe("transfers", () => {
  it("transfer pushes money to the seller and returns a charge", async () => {
    const { agentRec, sellerRec, agent } = setup(usd("1"));
    const c = await agent.transfer({ sellerId: sellerRec.id, amountMicros: usd("0.25"), reference: "inv-42" });
    expect(c.id).toMatch(/^chg_[a-z0-9]{24}$/);
    expect(c).toMatchObject({
      credentialId: null, mandateId: null, sellerId: sellerRec.id, agentId: agentRec.id,
      amountMicros: "250000", description: "inv-42", refundedMicros: "0",
    });
    expect(mock.wallet(agentRec.id)).toMatchObject({ availableMicros: "750000", heldMicros: "0" });
    expect(mock.sellerBalance(sellerRec.id).owedMicros).toBe("250000");
    expect((await agent.payments()).map((p) => p.id)).toContain(c.id);
  });

  it("transfer is idempotent and refuses an overdraft", async () => {
    const { agentRec, sellerRec, agent } = setup("100000");
    const a = await agent.transfer({ sellerId: sellerRec.id, amountMicros: "30000", idempotencyKey: "t1" });
    const b = await agent.transfer({ sellerId: sellerRec.id, amountMicros: "30000", idempotencyKey: "t1" });
    expect(b).toEqual(a);
    expect(mock.wallet(agentRec.id).availableMicros).toBe("70000");
    expect((await rejection(agent.transfer({ sellerId: sellerRec.id, amountMicros: "1", idempotencyKey: "t1" }))).code)
      .toBe("idempotency_conflict");
    const poor = await rejection(agent.transfer({ sellerId: sellerRec.id, amountMicros: "70001" }));
    expect([poor.code, poor.status]).toEqual(["insufficient_funds", 402]);
    const nf = await rejection(agent.transfer({ sellerId: "sel_" + "z".repeat(24), amountMicros: "1" }));
    expect(nf.code).toBe("not_found");
  });

  it("the transfer route requires an Idempotency-Key", async () => {
    const { agentRec, sellerRec } = setup();
    const r = await call("POST", "/v1/transfers", agentRec.apiKey, { sellerId: sellerRec.id, amountMicros: "1" });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("validation_failed");
  });
});

describe("refunds", () => {
  it("refund defaults to the full remaining amount and returns money to the wallet", async () => {
    const { agentRec, sellerRec, agent, seller } = setup(usd("1"));
    const c = await agent.transfer({ sellerId: sellerRec.id, amountMicros: usd("0.4") });
    const part = await seller.refund({ chargeId: c.id, amountMicros: usd("0.1") });
    expect(part.id).toMatch(/^rfd_[a-z0-9]{24}$/);
    expect(part).toMatchObject({ chargeId: c.id, amountMicros: "100000" });
    expect(mock.wallet(agentRec.id).availableMicros).toBe("700000");
    expect(mock.sellerBalance(sellerRec.id).owedMicros).toBe("300000");

    const rest = await seller.refund({ chargeId: c.id });
    expect(rest.amountMicros).toBe("300000");
    expect(mock.wallet(agentRec.id).availableMicros).toBe("1000000");
    const charge = (await agent.payments()).find((p) => p.id === c.id)!;
    expect(charge.refundedMicros).toBe("400000");

    const more = await rejection(seller.refund({ chargeId: c.id, amountMicros: "1" }));
    expect(more.code).toBe("amount_exceeds_remaining");
  });

  it("refund is idempotent", async () => {
    const { sellerRec, agent, seller } = setup();
    const c = await agent.transfer({ sellerId: sellerRec.id, amountMicros: "50000" });
    const a = await seller.refund({ chargeId: c.id, amountMicros: "10000", idempotencyKey: "r1" });
    const b = await seller.refund({ chargeId: c.id, amountMicros: "10000", idempotencyKey: "r1" });
    expect(b).toEqual(a);
    expect(mock.sellerBalance(sellerRec.id).owedMicros).toBe("40000");
    expect((await rejection(seller.refund({ chargeId: c.id, amountMicros: "20000", idempotencyKey: "r1" }))).code)
      .toBe("idempotency_conflict");
  });

  it("refund fails with insufficient_seller_balance when the unsettled balance is too small", async () => {
    const { sellerRec, agent, seller } = setup();
    const c = await agent.transfer({ sellerId: sellerRec.id, amountMicros: "50000" });
    mock.settleSeller(sellerRec.id);
    expect(mock.sellerBalance(sellerRec.id)).toEqual({ owedMicros: "0", paidOutMicros: "50000" });
    const err = await rejection(seller.refund({ chargeId: c.id }));
    expect([err.code, err.status]).toEqual(["insufficient_seller_balance", 409]);
  });

  it("only the seller of a charge can refund it", async () => {
    const { sellerRec, agent } = setup();
    const c = await agent.transfer({ sellerId: sellerRec.id, amountMicros: "50000" });
    const otherRec = mock.addSeller();
    const other = new GaitwaySeller({ apiKey: otherRec.apiKey, sellerId: otherRec.id, baseUrl: mock.url });
    expect((await rejection(other.refund({ chargeId: c.id }))).code).toBe("forbidden");
    expect((await rejection(other.refund({ chargeId: "chg_" + "z".repeat(24) }))).code).toBe("not_found");
  });
});

describe("spending rules", () => {
  it("perPaymentMaxMicros caps credentials and transfers", async () => {
    const { agentRec, sellerRec, agent } = setup();
    mock.setRules(agentRec.id, { perPaymentMaxMicros: "50000" });
    const e1 = await rejection(agent.createCredential({ sellerId: sellerRec.id, maxMicros: "50001" }));
    expect([e1.code, e1.status]).toEqual(["rule_violation", 403]);
    await agent.createCredential({ sellerId: sellerRec.id, maxMicros: "50000" });
    expect((await rejection(agent.transfer({ sellerId: sellerRec.id, amountMicros: "50001" }))).code).toBe("rule_violation");
    await agent.transfer({ sellerId: sellerRec.id, amountMicros: "50000" });
  });

  it("allowedSellerIds limits credentials, mandates, and transfers", async () => {
    const { agentRec, sellerRec, agent } = setup();
    const other = mock.addSeller();
    mock.setRules(agentRec.id, { allowedSellerIds: [sellerRec.id] });
    for (const p of [
      agent.createCredential({ sellerId: other.id, maxMicros: "100" }),
      agent.createMandate({ sellerId: other.id, maxPerPeriodMicros: "100", period: "day" }),
      agent.transfer({ sellerId: other.id, amountMicros: "100" }),
    ]) {
      expect((await rejection(p)).code).toBe("rule_violation");
    }
    await agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: "100", period: "day" });
    mock.setRules(agentRec.id, null);
    await agent.transfer({ sellerId: other.id, amountMicros: "100" });
  });

  it("dailyMaxMicros counts charges, mandate charges, and transfers over the UTC day", async () => {
    const { agentRec, sellerRec, agent, seller } = setup(usd("1"));
    mock.setRules(agentRec.id, { dailyMaxMicros: "100000" });
    const cred = await agent.createCredential({ sellerId: sellerRec.id, maxMicros: "100000" });
    await seller.charge({ credentialId: cred.id, amountMicros: "40000" });
    await agent.transfer({ sellerId: sellerRec.id, amountMicros: "30000" });
    const m = await agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: usd("1"), period: "month" });
    await seller.chargeMandate({ mandateId: m.id, amountMicros: "20000" });
    // 90000 spent today
    expect((await rejection(seller.charge({ credentialId: cred.id, amountMicros: "10001" }))).code).toBe("rule_violation");
    expect((await rejection(agent.transfer({ sellerId: sellerRec.id, amountMicros: "10001" }))).code).toBe("rule_violation");
    expect((await rejection(seller.chargeMandate({ mandateId: m.id, amountMicros: "10001" }))).code).toBe("rule_violation");
    await seller.chargeMandate({ mandateId: m.id, amountMicros: "10000" });
    mock.advanceTime(24 * 3600 * 1000);
    await agent.transfer({ sellerId: sellerRec.id, amountMicros: "100000" });
  });
});

describe("policy hook outcome", () => {
  it("a hold refuses credential, mandate, and transfer with rule_violation details", async () => {
    const { biz, sellerRec, agent } = setup();
    mock.setPolicyOutcome(biz.id, {
      outcome: "hold", reasons: ["Over team budget", "Needs a manager"], approvalLink: "https://approve.example/123",
    });
    for (const p of [
      agent.createCredential({ sellerId: sellerRec.id, maxMicros: "100" }),
      agent.createMandate({ sellerId: sellerRec.id, maxPerPeriodMicros: "100", period: "day" }),
      agent.transfer({ sellerId: sellerRec.id, amountMicros: "100" }),
    ]) {
      const err = await rejection(p);
      expect(err.code).toBe("rule_violation");
      expect(err.status).toBe(403);
      expect(err.message).toBe("Over team budget; Needs a manager");
      expect(err.details).toEqual({ outcome: "hold", approvalLink: "https://approve.example/123" });
      const d = err.details as { outcome: string; approvalLink: string | null };
      expect(d.outcome).toBe("hold");
      expect(d.approvalLink).toBe("https://approve.example/123");
    }
  });

  it("block has a null approvalLink; allow and null let requests through", async () => {
    const { biz, agentRec, sellerRec, agent } = setup();
    mock.setPolicyOutcome(biz.id, { outcome: "block", reasons: ["Seller not approved"], approvalLink: null });
    const err = await rejection(agent.transfer({ sellerId: sellerRec.id, amountMicros: "100" }));
    expect(err.details).toEqual({ outcome: "block", approvalLink: null });
    expect(mock.wallet(agentRec.id).availableMicros).toBe(usd("1"));

    mock.setPolicyOutcome(biz.id, { outcome: "allow", reasons: [], approvalLink: null });
    await agent.transfer({ sellerId: sellerRec.id, amountMicros: "100" });
    mock.setPolicyOutcome(biz.id, null);
    await agent.createCredential({ sellerId: sellerRec.id, maxMicros: "100" });
  });

  it("the policy hook runs after the business's own rules", async () => {
    const { biz, agentRec, sellerRec, agent } = setup();
    mock.setRules(agentRec.id, { perPaymentMaxMicros: "10" });
    mock.setPolicyOutcome(biz.id, { outcome: "hold", reasons: ["hook"], approvalLink: "https://a.example" });
    const err = await rejection(agent.transfer({ sellerId: sellerRec.id, amountMicros: "100" }));
    expect(err.code).toBe("rule_violation");
    expect(err.message).not.toBe("hook");
  });
});
