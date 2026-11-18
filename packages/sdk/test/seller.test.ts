import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { startMockGaitway, type MockGaitway } from "../src/testing/mock-gaitway.js";
import { GaitwayError, GaitwaySeller, usd } from "../src/index.js";

let mock: MockGaitway;
beforeAll(async () => {
  mock = await startMockGaitway();
});
afterAll(async () => {
  await mock.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function setup(balance = usd("1")) {
  const biz = mock.addBusiness({ name: "Acme", email: "ops@acme.test", verified: true });
  const agent = mock.addAgent(biz.id, balance, "Scout");
  const seller = mock.addSeller();
  const client = new GaitwaySeller({ apiKey: seller.apiKey, sellerId: seller.id, baseUrl: mock.url });
  return { biz, agent, seller, client };
}

async function credential(agentKey: string, sellerId: string, maxMicros = usd("0.5"), ttlSeconds?: number) {
  const res = await fetch(`${mock.url}/v1/credentials`, {
    method: "POST",
    headers: { authorization: `Bearer ${agentKey}`, "content-type": "application/json" },
    body: JSON.stringify({ sellerId, maxMicros, ...(ttlSeconds ? { ttlSeconds } : {}) }),
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as any;
  return json.credential as { id: string; token: string; expiresAt: string };
}

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

async function expectInvalid(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(GaitwayError);
  expect((err as GaitwayError).code).toBe("invalid_credential");
}

/** Counts calls to the JWKS URL made through global fetch, passing every call through. */
function countJwksFetches() {
  const real = globalThis.fetch;
  const counter = { n: 0 };
  vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (String(url).endsWith("/.well-known/jwks.json")) counter.n++;
    return real(input, init);
  });
  return counter;
}

function claimsFor(t: ReturnType<typeof setup>, over: Record<string, unknown> = {}) {
  const iat = Math.floor(Date.now() / 1000);
  return {
    iss: mock.url, sub: t.agent.id, aud: t.seller.id, jti: "crd_aaaaaaaaaaaaaaaaaaaaaaaa", iat, exp: iat + 300,
    env: "test", biz: { id: t.biz.id, name: "Acme", email: "ops@acme.test", verified: true },
    agent: { id: t.agent.id, name: "Scout" }, max: "10000", cur: "USD",
    ...over,
  };
}

describe("GaitwaySeller.verify", () => {
  it("accepts a token from the mock and returns the mapped claims", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    const claims = await t.client.verify(c.token);
    expect(claims).toEqual({
      credentialId: c.id,
      agentId: t.agent.id,
      agentName: "Scout",
      business: { id: t.biz.id, name: "Acme", email: "ops@acme.test", verified: true },
      maxMicros: usd("0.5"),
      expiresAt: new Date(c.expiresAt),
      env: "test",
    });
    expect(claims.expiresAt).toBeInstanceOf(Date);
  });

  it("rejects a token for another seller", async () => {
    const t = setup();
    const other = mock.addSeller();
    const c = await credential(t.agent.apiKey, other.id);
    await expectInvalid(t.client.verify(c.token));
  });

  it("rejects an expired token", async () => {
    const t = setup();
    const past = Math.floor(Date.now() / 1000) - 600;
    const token = await mock.signToken(claimsFor(t, { iat: past, exp: past + 300 }));
    await expectInvalid(t.client.verify(token));
  });

  it("rejects a mock credential once the clock passes its expiry", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id, usd("0.1"), 10);
    await t.client.verify(c.token);
    vi.useFakeTimers({ now: Date.now() + 11_000, toFake: ["Date"] });
    try {
      await expectInvalid(t.client.verify(c.token));
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a token signed by an unknown key", async () => {
    const t = setup();
    const { privateKey } = await generateKeyPair("ES256");
    const kid = mock.jwks.keys[0]!.kid!;
    const token = await new SignJWT(claimsFor(t) as any)
      .setProtectedHeader({ alg: "ES256", kid, typ: "gaitway-credential+jwt" })
      .sign(privateKey);
    await expectInvalid(t.client.verify(token));
  });

  it('rejects a token with alg "none"', async () => {
    const t = setup();
    const kid = mock.jwks.keys[0]!.kid!;
    const token = `${b64url({ alg: "none", kid, typ: "gaitway-credential+jwt" })}.${b64url(claimsFor(t))}.`;
    await expectInvalid(t.client.verify(token));
  });

  it("rejects a token whose typ is not gaitway-credential+jwt", async () => {
    const t = setup();
    await expectInvalid(t.client.verify(await mock.signToken(claimsFor(t), { typ: "JWT" })));
    await expectInvalid(t.client.verify(await mock.signToken(claimsFor(t), { typ: "gaitway-mandate+jwt" })));
  });

  it("rejects garbage and tokens missing required claims", async () => {
    const t = setup();
    await expectInvalid(t.client.verify("not-a-jwt"));
    await expectInvalid(t.client.verify(""));
    const { max: _max, ...noMax } = claimsFor(t);
    await expectInvalid(t.client.verify(await mock.signToken(noMax)));
    await expectInvalid(t.client.verify(await mock.signToken(claimsFor(t, { max: "1.5" }))));
  });

  it("fetches the JWKS once across 50 verifies", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    const counter = countJwksFetches();
    await Promise.all(Array.from({ length: 25 }, () => t.client.verify(c.token)));
    for (let i = 0; i < 25; i++) await t.client.verify(c.token);
    expect(counter.n).toBe(1);
  });

  it("refetches the JWKS once when it meets an unknown kid", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    const counter = countJwksFetches();
    await t.client.verify(c.token);
    expect(counter.n).toBe(1);

    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT(claimsFor(t) as any)
      .setProtectedHeader({ alg: "ES256", kid: "rotated-key", typ: "gaitway-credential+jwt" })
      .sign(privateKey);
    await expectInvalid(t.client.verify(token));
    expect(counter.n).toBe(2);

    // A flood of unknown kids does not turn into a flood of fetches.
    for (let i = 0; i < 10; i++) await expectInvalid(t.client.verify(token));
    expect(counter.n).toBe(2);

    // Known keys keep working from the cache.
    await t.client.verify(c.token);
    expect(counter.n).toBe(2);
  });

  it("reports an unreachable JWKS as a network error, not an invalid credential", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id);
    const down = new GaitwaySeller({ apiKey: t.seller.apiKey, sellerId: t.seller.id, baseUrl: "http://127.0.0.1:1" });
    const err = await down.verify(c.token).catch((e) => e);
    expect(err).toBeInstanceOf(GaitwayError);
    expect(err.code).toBe("network_error");
  });
});

describe("GaitwaySeller.charge", () => {
  function captureIdempotencyKeys() {
    const real = globalThis.fetch;
    const keys: (string | null)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url ?? String(input);
      if (String(url).endsWith("/v1/charges")) keys.push(new Headers(init?.headers).get("idempotency-key"));
      return real(input, init);
    });
    return keys;
  }

  it("generates an idempotency key when none is given", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id, usd("0.05"));
    const keys = captureIdempotencyKeys();
    const a = await t.client.charge({ credentialId: c.id, amountMicros: usd("0.01") });
    const b = await t.client.charge({ credentialId: c.id, amountMicros: usd("0.01") });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
    expect(a.charge.id).not.toBe(b.charge.id);
    expect(b.remainingMicros).toBe(usd("0.03"));
  });

  it("sends the given idempotency key, so a repeat charges once", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id, usd("0.05"));
    const keys = captureIdempotencyKeys();
    const input = { credentialId: c.id, amountMicros: usd("0.01"), description: "one message", idempotencyKey: "req-123" };
    const a = await t.client.charge(input);
    const b = await t.client.charge(input);
    expect(keys).toEqual(["req-123", "req-123"]);
    expect(b.charge.id).toBe(a.charge.id);
    expect(a.charge.description).toBe("one message");
    expect(mock.credential(c.id).remainingMicros).toBe(usd("0.04"));
  });

  it("passes final and surfaces API refusals as GaitwayError", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id, usd("0.05"));
    const r = await t.client.charge({ credentialId: c.id, amountMicros: usd("0.01"), final: true });
    expect(r.remainingMicros).toBe(usd("0.04"));
    expect(mock.credential(c.id).status).toBe("released");
    const err = await t.client.charge({ credentialId: c.id, amountMicros: usd("0.01") }).catch((e) => e);
    expect(err).toBeInstanceOf(GaitwayError);
    expect(err.code).toBe("credential_not_active");
    expect(err.status).toBe(409);
  });
});

describe("GaitwaySeller.getCredential", () => {
  it("returns the credential without its token", async () => {
    const t = setup();
    const c = await credential(t.agent.apiKey, t.seller.id, usd("0.05"));
    const got = await t.client.getCredential(c.id);
    expect(got.id).toBe(c.id);
    expect(got.sellerId).toBe(t.seller.id);
    expect(got.remainingMicros).toBe(usd("0.05"));
    expect(got.token).toBeUndefined();
  });
});

describe("GaitwaySeller.paymentRequired", () => {
  it("returns the exact 402 body from context.md section 7", () => {
    const t = setup();
    const r = t.client.paymentRequired({ priceMicros: "10000", priceNote: "per message" });
    expect(r.status).toBe(402);
    expect(JSON.stringify(r.body)).toBe(
      JSON.stringify({
        error: { code: "payment_required", message: "Pay with Gaitway" },
        gaitway: { sellerId: t.seller.id, priceMicros: "10000", priceNote: "per message", apiBase: mock.url },
      }),
    );
  });

  it("uses null for a missing price", () => {
    const t = setup();
    expect(t.client.paymentRequired().body).toEqual({
      error: { code: "payment_required", message: "Pay with Gaitway" },
      gaitway: { sellerId: t.seller.id, priceMicros: null, priceNote: null, apiBase: mock.url },
    });
  });
});
