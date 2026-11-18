import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { startMockGaitway, type MockGaitway } from "../src/testing/mock-gaitway.js";
import { GaitwayError } from "../src/http.js";
import { usd } from "../src/money.js";

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
  const biz = mock.addBusiness({ name: "Acme", email: "ops@acme.test" });
  const agent = mock.addAgent(biz.id, balance, "Scout");
  const seller = mock.addSeller();
  return { biz, agent, seller };
}

describe("mock gaitway", () => {
  it("has health and jwks", async () => {
    const h = await call("GET", "/health", null);
    expect(h.json).toEqual({ ok: true });
    const j = await call("GET", "/.well-known/jwks.json", null);
    expect(j.status).toBe(200);
    expect(j.json.keys[0].kty).toBe("EC");
    expect(j.json.keys[0].kid).toBe(mock.jwks.keys[0].kid);
    expect(j.json.keys[0].d).toBeUndefined();
  });

  it("requires auth and the right key type", async () => {
    const { agent, seller } = setup();
    expect((await call("GET", "/v1/wallet", null)).json.error.code).toBe("unauthorized");
    expect((await call("GET", "/v1/wallet", "gw_test_agt_nope")).status).toBe(401);
    const wrong = await call("GET", "/v1/wallet", seller.apiKey);
    expect(wrong.status).toBe(403);
    expect(wrong.json.error.code).toBe("forbidden");
    const ok = await call("GET", "/v1/wallet", agent.apiKey);
    expect(ok.json.wallet).toEqual({ walletId: agent.walletId, agentId: agent.id, availableMicros: usd("1"), heldMicros: "0" });
  });

  it("refuses a credential above the balance with 402 insufficient_funds", async () => {
    const { agent, seller } = setup(usd("0.01"));
    const r = await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: usd("0.02") });
    expect(r.status).toBe(402);
    expect(r.json.error.code).toBe("insufficient_funds");
    expect(typeof r.json.error.message).toBe("string");
  });

  it("validates credential input", async () => {
    const { agent, seller } = setup();
    const r = await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "12.5" });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("validation_failed");
    const t = await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "100", ttlSeconds: 5 });
    expect(t.status).toBe(422);
    const nf = await call("POST", "/v1/credentials", agent.apiKey, { sellerId: "sel_" + "z".repeat(24), maxMicros: "100" });
    expect(nf.status).toBe(404);
  });

  it("issues a verifiable token carrying every claim in context.md section 7", async () => {
    const { biz, agent, seller } = setup();
    const r = await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: usd("0.5"), ttlSeconds: 60 });
    expect(r.status).toBe(200);
    const cred = r.json.credential;
    expect(cred.id).toMatch(/^crd_[a-z0-9]{24}$/);
    expect(cred.status).toBe("active");
    expect(cred.maxMicros).toBe("500000");
    expect(cred.remainingMicros).toBe("500000");
    expect(cred.sellerId).toBe(seller.id);
    expect(cred.agentId).toBe(agent.id);
    expect(cred.businessId).toBe(biz.id);
    expect(new Date(cred.expiresAt).toISOString()).toBe(cred.expiresAt);

    const header = decodeProtectedHeader(cred.token);
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("gaitway-credential+jwt");
    expect(header.kid).toBe(mock.jwks.keys[0].kid);

    const { payload } = await jwtVerify(cred.token, createLocalJWKSet(mock.jwks), { audience: seller.id, issuer: mock.url });
    expect(payload.iss).toBe(mock.url);
    expect(payload.sub).toBe(agent.id);
    expect(payload.aud).toBe(seller.id);
    expect(payload.jti).toBe(cred.id);
    expect(payload.env).toBe("test");
    expect(payload.biz).toEqual({ id: biz.id, name: "Acme", email: "ops@acme.test", verified: false });
    expect(payload.agent).toEqual({ id: agent.id, name: "Scout" });
    expect(payload.max).toBe("500000");
    expect(payload.cur).toBe("USD");
    expect(payload.exp! - payload.iat!).toBe(60);
    expect(Math.abs(payload.exp! * 1000 - Date.parse(cred.expiresAt))).toBeLessThan(1000);

    const w = await call("GET", "/v1/wallet", agent.apiKey);
    expect(w.json.wallet.availableMicros).toBe("500000");
    expect(w.json.wallet.heldMicros).toBe("500000");
  });

  it("charges reduce remaining; repeated idempotency key returns the same charge", async () => {
    const { agent, seller } = setup();
    const c = (await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: usd("0.05") })).json.credential;
    const body = { credentialId: c.id, amountMicros: usd("0.01"), description: "msg" };
    const a = await call("POST", "/v1/charges", seller.apiKey, body, { "idempotency-key": "k1" });
    expect(a.status).toBe(200);
    expect(a.json.remainingMicros).toBe("40000");
    expect(a.json.charge.id).toMatch(/^chg_[a-z0-9]{24}$/);
    expect(a.json.charge).toMatchObject({
      credentialId: c.id, mandateId: null, sellerId: seller.id, agentId: agent.id,
      amountMicros: "10000", feeMicros: "0", refundedMicros: "0", description: "msg",
    });
    const b = await call("POST", "/v1/charges", seller.apiKey, body, { "idempotency-key": "k1" });
    expect(b.status).toBe(200);
    expect(b.json).toEqual(a.json);
    const got = await call("GET", `/v1/credentials/${c.id}`, seller.apiKey);
    expect(got.json.credential.remainingMicros).toBe("40000");
    expect(got.json.credential.token).toBeUndefined();

    const bal = await call("GET", "/v1/seller/balance", seller.apiKey);
    expect(bal.json).toEqual({ owedMicros: "10000", paidOutMicros: "0" });
    const conflict = await call("POST", "/v1/charges", seller.apiKey, { ...body, amountMicros: "20000" }, { "idempotency-key": "k1" });
    expect(conflict.status).toBe(409);
    expect(conflict.json.error.code).toBe("idempotency_conflict");
    const missing = await call("POST", "/v1/charges", seller.apiKey, body);
    expect(missing.status).toBe(422);

    const list = await call("GET", "/v1/charges", seller.apiKey);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.nextCursor).toBeNull();
    const pays = await call("GET", "/v1/payments", agent.apiKey);
    expect(pays.json.data).toHaveLength(1);
  });

  it("charge above remaining returns 409 amount_exceeds_remaining", async () => {
    const { agent, seller } = setup();
    const c = (await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "10000" })).json.credential;
    const r = await call("POST", "/v1/charges", seller.apiKey, { credentialId: c.id, amountMicros: "10001" }, { "idempotency-key": "x" });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("amount_exceeds_remaining");
  });

  it("exhausts a credential, releases early, and rejects other sellers", async () => {
    const { agent, seller } = setup();
    const other = mock.addSeller();
    const c = (await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "10000" })).json.credential;
    const foreign = await call("POST", "/v1/charges", other.apiKey, { credentialId: c.id, amountMicros: "1" }, { "idempotency-key": "f" });
    expect(foreign.status).toBe(403);
    await call("POST", "/v1/charges", seller.apiKey, { credentialId: c.id, amountMicros: "10000" }, { "idempotency-key": "e1" });
    expect((await call("GET", `/v1/credentials/${c.id}`, agent.apiKey)).json.credential.status).toBe("exhausted");
    const again = await call("POST", "/v1/charges", seller.apiKey, { credentialId: c.id, amountMicros: "1" }, { "idempotency-key": "e2" });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("credential_not_active");

    const c2 = (await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "50000" })).json.credential;
    const rel = await call("POST", `/v1/credentials/${c2.id}/release`, agent.apiKey);
    expect(rel.json.credential.status).toBe("released");
    const w = (await call("GET", "/v1/wallet", agent.apiKey)).json.wallet;
    expect(w.heldMicros).toBe("0");
    expect(w.availableMicros).toBe("990000");
    expect((await call("POST", `/v1/credentials/${c2.id}/release`, agent.apiKey)).json.error.code).toBe("credential_not_active");
  });

  it("final charge releases the rest; expiry returns credential_expired and frees the hold", async () => {
    const { agent, seller } = setup();
    const c = (await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "50000" })).json.credential;
    await call("POST", "/v1/charges", seller.apiKey, { credentialId: c.id, amountMicros: "10000", final: true }, { "idempotency-key": "fin" });
    expect((await call("GET", `/v1/credentials/${c.id}`, seller.apiKey)).json.credential.status).toBe("released");
    expect((await call("GET", "/v1/wallet", agent.apiKey)).json.wallet.heldMicros).toBe("0");

    const c2 = (await call("POST", "/v1/credentials", agent.apiKey, { sellerId: seller.id, maxMicros: "50000", ttlSeconds: 10 })).json.credential;
    mock.advanceTime(11_000);
    const r = await call("POST", "/v1/charges", seller.apiKey, { credentialId: c2.id, amountMicros: "1" }, { "idempotency-key": "exp" });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("credential_expired");
    expect((await call("GET", "/v1/wallet", agent.apiKey)).json.wallet.heldMicros).toBe("0");
  });

  it("GaitwayError carries code, status, details", () => {
    const e = new GaitwayError("insufficient_funds", "no", 402, { a: 1 });
    expect(e).toBeInstanceOf(Error);
    expect([e.code, e.status, e.message, e.details]).toEqual(["insufficient_funds", 402, "no", { a: 1 }]);
  });
});
