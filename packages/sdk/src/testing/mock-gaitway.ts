// In-memory mock of the Gaitway API (context.md section 8) for SDK tests and local work.
// Implements only the routes the SDK needs. Uses node:http, no framework.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose";
import type { Charge, Credential, Mandate, Refund, Rules, Seller, Service, Wallet } from "../types.js";

export type MockBusiness = { id: string; name: string; email: string; apiKey: string };
export type MockAgent = { id: string; name: string; businessId: string; walletId: string; apiKey: string };
export type MockSeller = { id: string; name: string; apiKey: string };
/** What the business's policy hook answers (context.md section 8). `null` means no hook is set. */
export type MockPolicyOutcome = {
  outcome: "allow" | "hold" | "block";
  reasons: string[];
  approvalLink: string | null;
};

export interface MockGaitway {
  /** Base URL of the mock, also its credential issuer (`iss`). */
  url: string;
  port: number;
  /** Public keys the mock signs credentials with. */
  jwks: { keys: JWK[] };
  close(): Promise<void>;
  addBusiness(opts?: { name?: string; email?: string; verified?: boolean }): MockBusiness;
  addAgent(businessId: string, balanceMicros: string | bigint, name?: string): MockAgent;
  addSeller(opts?: { name?: string }): MockSeller;
  /** Current wallet of an agent (after applying lazy expiry). */
  wallet(agentId: string): Wallet;
  sellerBalance(sellerId: string): { owedMicros: string; paidOutMicros: string };
  credential(id: string): Credential;
  /** Move the mock's clock forward; credentials expire against it. */
  advanceTime(ms: number): void;
  /** Disable or enable an agent (a disabled agent cannot create credentials). */
  setAgentStatus(agentId: string, status: "active" | "disabled"): void;
  /** Sign arbitrary claims with the mock's key (for negative tests). Header typ defaults to the credential typ. */
  signToken(claims: Record<string, unknown>, header?: { typ?: string; kid?: string }): Promise<string>;

  // ---- M2 ----
  /** Add a service to a seller's public directory entry. */
  addService(sellerId: string, service?: Partial<Omit<Service, "id" | "sellerId">>): Service;
  /** Set an agent's spending rules; omitted fields are null. `null` clears every rule. */
  setRules(agentId: string, rules: Partial<Rules> | null): Rules;
  /**
   * Simulate the business's policy hook. Anything other than `allow` makes credential, mandate,
   * and transfer creation fail with `rule_violation` and `details: { outcome, approvalLink }`.
   * `null` removes the hook.
   */
  setPolicyOutcome(businessId: string, outcome: MockPolicyOutcome | null): void;
  mandate(id: string): Mandate;
  /** Revoke a mandate, as the business route `DELETE /v1/mandates/:id` would. */
  revokeMandate(id: string): Mandate;
  /** Pay out everything a seller is owed (owed becomes paid out), as a settlement would. */
  settleSeller(sellerId: string): void;
}

type Role = "biz" | "agt" | "sel";
type CredRec = Credential & { env: "test"; held: bigint; remaining: bigint; max: bigint; expMs: number };
type WalletRec = { walletId: string; agentId: string; available: bigint; held: bigint };
type StoredResponse = { status: number; body: unknown; fingerprint: string };
type MandateRec = Omit<Mandate, "token"> & { max: bigint; token: string };
type ChargeRec = Charge & { atMs: number };

const PERIODS = new Set(["day", "week", "month"]);
const DAY_MS = 86_400_000;

/** Start (UTC) of the period containing `ms`. Weeks start on Monday. */
function periodStart(period: Mandate["period"], ms: number): number {
  const d = new Date(ms);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (period === "day") return day;
  if (period === "week") return day - ((d.getUTCDay() + 6) % 7) * DAY_MS;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
function rand(len: number, alphabet: string): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i]! % alphabet.length];
  return s;
}
const newId = (prefix: string) => `${prefix}_${rand(24, B36)}`;
const newKey = (role: Role) => `gw_test_${role}_${rand(32, B36)}`;

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
const DIGITS = /^\d+$/;

export async function startMockGaitway(opts: { port?: number; feeBps?: number } = {}): Promise<MockGaitway> {
  const feeBps = BigInt(opts.feeBps ?? 0);
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const kid = `mock-${rand(8, B36)}`;
  const pub = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" } as JWK;
  const jwks = { keys: [pub] };

  let offsetMs = 0;
  const now = () => Date.now() + offsetMs;

  const businesses = new Map<string, MockBusiness & { verified: boolean }>();
  const agents = new Map<string, MockAgent & { status: "active" | "disabled" }>();
  const wallets = new Map<string, WalletRec>(); // by agentId
  const sellers = new Map<string, MockSeller & { owed: bigint; paidOut: bigint }>();
  const keys = new Map<string, { role: Role; id: string }>();
  const creds = new Map<string, CredRec>();
  const charges: ChargeRec[] = [];
  const idem = new Map<string, StoredResponse>();
  const services = new Map<string, Service[]>(); // by sellerId
  const rules = new Map<string, Rules>(); // by agentId
  const policy = new Map<string, MockPolicyOutcome>(); // by businessId
  const mandates = new Map<string, MandateRec>();
  const refunds: Refund[] = [];

  const publicCharge = ({ atMs: _a, ...c }: ChargeRec): Charge => ({ ...c });
  const publicSeller = (id: string): Seller => ({
    id, name: sellers.get(id)!.name, services: (services.get(id) ?? []).filter((s) => s.active).map((s) => ({ ...s })),
  });
  const publicMandate = (m: MandateRec, withToken = false): Mandate => {
    const { max: _m, token, ...rest } = m;
    return withToken ? { ...rest, token } : { ...rest };
  };

  const ruleViolation = (message: string, details?: unknown) => new ApiError(403, "rule_violation", message, details);

  /** The rules checked when a credential, mandate, or transfer is created (context.md section 8). */
  function checkCreateRules(agentId: string, sellerId: string, amount: bigint | null) {
    const r = rules.get(agentId);
    if (!r) return;
    if (r.allowedSellerIds && !r.allowedSellerIds.includes(sellerId)) {
      throw ruleViolation("This seller is not on the agent's allowed list");
    }
    if (amount !== null && r.perPaymentMaxMicros !== null && amount > BigInt(r.perPaymentMaxMicros)) {
      throw ruleViolation("Amount is above the agent's per-payment limit");
    }
  }

  /** `dailyMaxMicros`, counted over the UTC day, checked whenever money moves to a seller. */
  function checkDaily(agentId: string, amount: bigint) {
    const max = rules.get(agentId)?.dailyMaxMicros;
    if (max === null || max === undefined) return;
    const from = periodStart("day", now());
    const spent = charges
      .filter((c) => c.agentId === agentId && c.atMs >= from)
      .reduce((sum, c) => sum + BigInt(c.amountMicros), 0n);
    if (spent + amount > BigInt(max)) throw ruleViolation("This payment would exceed the agent's daily limit");
  }

  /** The business's policy hook, consulted after its own rules pass. */
  function checkPolicy(businessId: string) {
    const p = policy.get(businessId);
    if (!p || p.outcome === "allow") return;
    const message = p.reasons.length ? p.reasons.join("; ") : `Refused by the business's policy (${p.outcome})`;
    throw ruleViolation(message, { outcome: p.outcome, approvalLink: p.approvalLink });
  }

  function activeAgent(agentId: string) {
    const agent = agents.get(agentId)!;
    if (agent.status === "disabled") throw new ApiError(403, "forbidden", "This agent is disabled");
    return agent;
  }

  function recordCharge(c: Omit<Charge, "id" | "createdAt" | "feeMicros" | "refundedMicros">): Charge {
    const atMs = now();
    const fee = (BigInt(c.amountMicros) * feeBps) / 10000n;
    const rec: ChargeRec = {
      id: newId("chg"), ...c, feeMicros: fee.toString(), refundedMicros: "0",
      createdAt: new Date(atMs).toISOString(), atMs,
    };
    charges.push(rec);
    return publicCharge(rec);
  }

  /** Run `fn` once per (scope, Idempotency-Key); a repeat returns the stored response. */
  async function idempotent(
    req: IncomingMessage, res: ServerResponse, scope: string, fingerprintOf: (body: Record<string, unknown>) => unknown,
    fn: (body: Record<string, unknown>) => Promise<unknown> | unknown,
  ) {
    const idemKey = req.headers["idempotency-key"];
    if (typeof idemKey !== "string" || !idemKey) {
      throw new ApiError(422, "validation_failed", "Idempotency-Key header is required");
    }
    const body = (await readJson(req)) as Record<string, unknown>;
    const fingerprint = JSON.stringify(fingerprintOf(body));
    const ik = `${scope}:${idemKey}`;
    const prior = idem.get(ik);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new ApiError(409, "idempotency_conflict", "This Idempotency-Key was used with a different request");
      }
      return send(res, prior.status, prior.body);
    }
    const out = await fn(body);
    idem.set(ik, { status: 200, body: out, fingerprint });
    return send(res, 200, out);
  }

  const addKey = (role: Role, id: string) => {
    const k = newKey(role);
    keys.set(k, { role, id });
    return k;
  };

  function sweep() {
    for (const c of creds.values()) {
      if (c.status === "active" && c.expMs <= now()) {
        const w = wallets.get(c.agentId)!;
        w.held -= c.held;
        w.available += c.held;
        c.held = 0n;
        c.status = "expired";
      }
    }
  }

  const publicCred = (c: CredRec, withToken = false): Credential => {
    const out: Credential = {
      id: c.id, sellerId: c.sellerId, agentId: c.agentId, businessId: c.businessId,
      maxMicros: c.max.toString(), remainingMicros: c.remaining.toString(),
      status: c.status, expiresAt: new Date(c.expMs).toISOString(),
    };
    if (withToken && c.token) out.token = c.token;
    return out;
  };
  const publicWallet = (w: WalletRec): Wallet => ({
    walletId: w.walletId, agentId: w.agentId,
    availableMicros: w.available.toString(), heldMicros: w.held.toString(),
  });

  async function signToken(claims: Record<string, unknown>, header: { typ?: string; kid?: string } = {}) {
    return new SignJWT(claims as any)
      .setProtectedHeader({ alg: "ES256", kid: header.kid ?? kid, typ: header.typ ?? "gaitway-credential+jwt" })
      .sign(privateKey as KeyLike);
  }

  // ---- HTTP plumbing ----
  async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError(422, "validation_failed", "Request body must be valid JSON");
    }
  }
  function send(res: ServerResponse, status: number, body: unknown) {
    const data = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
    res.end(data);
  }
  function auth(req: IncomingMessage, role: Role) {
    const h = req.headers.authorization;
    const m = typeof h === "string" ? /^Bearer (.+)$/.exec(h) : null;
    const rec = m ? keys.get(m[1]!) : undefined;
    if (!rec) throw new ApiError(401, "unauthorized", "Missing or invalid API key");
    if (rec.role !== role) throw new ApiError(403, "forbidden", "This key cannot use this route");
    return rec.id;
  }
  function authAny(req: IncomingMessage) {
    const h = req.headers.authorization;
    const m = typeof h === "string" ? /^Bearer (.+)$/.exec(h) : null;
    const rec = m ? keys.get(m[1]!) : undefined;
    if (!rec) throw new ApiError(401, "unauthorized", "Missing or invalid API key");
    return rec;
  }
  const str = (v: unknown, name: string): string => {
    if (typeof v !== "string" || !v) throw new ApiError(422, "validation_failed", `${name} is required`);
    return v;
  };
  const micros = (v: unknown, name: string): bigint => {
    if (typeof v !== "string" || !DIGITS.test(v) || BigInt(v) <= 0n) {
      throw new ApiError(422, "validation_failed", `${name} must be a positive whole number of micros as a string`);
    }
    return BigInt(v);
  };
  function paginate<T>(items: T[], url: URL) {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const start = Number(url.searchParams.get("cursor") ?? 0) || 0;
    const newestFirst = [...items].reverse();
    const data = newestFirst.slice(start, start + limit);
    const next = start + limit < newestFirst.length ? String(start + limit) : null;
    return { data, nextCursor: next };
  }

  // ---- route handlers ----
  async function route(req: IncomingMessage, res: ServerResponse) {
    sweep();
    const url = new URL(req.url ?? "/", "http://mock");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/health") return send(res, 200, { ok: true });
    if (method === "GET" && path === "/.well-known/jwks.json") return send(res, 200, jwks);

    if (method === "GET" && path === "/v1/wallet") {
      const agentId = auth(req, "agt");
      return send(res, 200, { wallet: publicWallet(wallets.get(agentId)!) });
    }

    if (method === "POST" && path === "/v1/credentials") {
      const agentId = auth(req, "agt");
      const body = (await readJson(req)) as Record<string, unknown>;
      const sellerId = str(body.sellerId, "sellerId");
      const max = micros(body.maxMicros, "maxMicros");
      let ttl = 300;
      if (body.ttlSeconds !== undefined) {
        if (!Number.isInteger(body.ttlSeconds) || (body.ttlSeconds as number) < 10 || (body.ttlSeconds as number) > 86400) {
          throw new ApiError(422, "validation_failed", "ttlSeconds must be an integer from 10 to 86400");
        }
        ttl = body.ttlSeconds as number;
      }
      const agent = activeAgent(agentId);
      const seller = sellers.get(sellerId);
      if (!seller) throw new ApiError(404, "not_found", "Seller not found");
      checkCreateRules(agentId, sellerId, max);
      checkPolicy(agent.businessId);
      const w = wallets.get(agentId)!;
      if (w.available < max) throw new ApiError(402, "insufficient_funds", "Wallet balance is too low for this credential");
      w.available -= max;
      w.held += max;

      const biz = businesses.get(agent.businessId)!;
      const id = newId("crd");
      const iatMs = now();
      const iat = Math.floor(iatMs / 1000);
      const exp = iat + ttl;
      const token = await signToken({
        iss: url0, sub: agentId, aud: sellerId, jti: id, iat, exp, env: "test",
        biz: { id: biz.id, name: biz.name, email: biz.email, verified: biz.verified },
        agent: { id: agent.id, name: agent.name },
        max: max.toString(), cur: "USD",
      });
      const rec: CredRec & { token?: string } = {
        id, sellerId, agentId, businessId: biz.id, maxMicros: max.toString(), remainingMicros: max.toString(),
        status: "active", expiresAt: new Date(exp * 1000).toISOString(), env: "test",
        held: max, remaining: max, max, expMs: exp * 1000,
      };
      (rec as any).token = token;
      creds.set(id, rec);
      return send(res, 200, { credential: publicCred(rec, true) });
    }

    let m = /^\/v1\/credentials\/([^/]+)\/release$/.exec(path);
    if (method === "POST" && m) {
      const agentId = auth(req, "agt");
      const c = creds.get(m[1]!);
      if (!c) throw new ApiError(404, "not_found", "Credential not found");
      if (c.agentId !== agentId) throw new ApiError(403, "forbidden", "This credential belongs to another agent");
      if (c.status !== "active") throw new ApiError(409, "credential_not_active", `Credential is ${c.status}`);
      const w = wallets.get(agentId)!;
      w.held -= c.held;
      w.available += c.held;
      c.held = 0n;
      c.status = "released";
      return send(res, 200, { credential: publicCred(c) });
    }

    m = /^\/v1\/credentials\/([^/]+)$/.exec(path);
    if (method === "GET" && m) {
      const who = authAny(req);
      const c = creds.get(m[1]!);
      if (!c) throw new ApiError(404, "not_found", "Credential not found");
      const allowed = (who.role === "sel" && c.sellerId === who.id) || (who.role === "agt" && c.agentId === who.id);
      if (!allowed) throw new ApiError(403, "forbidden", "Not allowed to read this credential");
      return send(res, 200, { credential: publicCred(c) });
    }

    if (method === "POST" && path === "/v1/charges") {
      const sellerId = auth(req, "sel");
      const idemKey = req.headers["idempotency-key"];
      if (typeof idemKey !== "string" || !idemKey) {
        throw new ApiError(422, "validation_failed", "Idempotency-Key header is required");
      }
      const body = (await readJson(req)) as Record<string, unknown>;
      const fingerprint = JSON.stringify([body.credentialId, body.amountMicros, body.final ?? false, body.description ?? null]);
      const ik = `${sellerId}:${idemKey}`;
      const prior = idem.get(ik);
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          throw new ApiError(409, "idempotency_conflict", "This Idempotency-Key was used with a different request");
        }
        return send(res, prior.status, prior.body);
      }
      const credentialId = str(body.credentialId, "credentialId");
      const amount = micros(body.amountMicros, "amountMicros");
      if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
        throw new ApiError(422, "validation_failed", "description must be a string");
      }
      const c = creds.get(credentialId);
      if (!c) throw new ApiError(404, "not_found", "Credential not found");
      if (c.sellerId !== sellerId) throw new ApiError(403, "forbidden", "This credential names a different seller");
      if (c.status === "expired") throw new ApiError(409, "credential_expired", "Credential has expired");
      if (c.status !== "active") throw new ApiError(409, "credential_not_active", `Credential is ${c.status}`);
      if (amount > c.remaining) {
        throw new ApiError(409, "amount_exceeds_remaining", "Charge is larger than what is left on the credential", {
          remainingMicros: c.remaining.toString(),
        });
      }
      checkDaily(c.agentId, amount);
      const w = wallets.get(c.agentId)!;
      c.remaining -= amount;
      c.held -= amount;
      w.held -= amount;
      sellers.get(sellerId)!.owed += amount;
      if (c.remaining === 0n) c.status = "exhausted";
      else if (body.final === true) c.status = "released";
      if (c.status !== "active" && c.held > 0n) {
        w.held -= c.held;
        w.available += c.held;
        c.held = 0n;
      }
      const charge = recordCharge({
        credentialId: c.id, mandateId: null, sellerId, agentId: c.agentId, amountMicros: amount.toString(),
        description: (body.description as string | null | undefined) ?? null,
      });
      const resp = { charge, remainingMicros: c.remaining.toString() };
      idem.set(ik, { status: 200, body: resp, fingerprint });
      return send(res, 200, resp);
    }

    if (method === "GET" && path === "/v1/payments") {
      const agentId = auth(req, "agt");
      return send(res, 200, paginate(charges.filter((c) => c.agentId === agentId).map(publicCharge), url));
    }
    if (method === "GET" && path === "/v1/charges") {
      const sellerId = auth(req, "sel");
      return send(res, 200, paginate(charges.filter((c) => c.sellerId === sellerId).map(publicCharge), url));
    }
    if (method === "GET" && path === "/v1/seller/balance") {
      const s = sellers.get(auth(req, "sel"))!;
      return send(res, 200, { owedMicros: s.owed.toString(), paidOutMicros: s.paidOut.toString() });
    }

    // ---- M2 ----
    if (method === "GET" && path === "/v1/sellers") {
      const q = (url.searchParams.get("query") ?? "").trim().toLowerCase();
      const list = [...sellers.keys()].map(publicSeller).filter((s) =>
        !q || s.name.toLowerCase().includes(q) ||
        s.services.some((v) => `${v.name}\n${v.description}\n${v.priceNote}`.toLowerCase().includes(q)));
      return send(res, 200, paginate(list, url));
    }
    m = /^\/v1\/sellers\/([^/]+)$/.exec(path);
    if (method === "GET" && m) {
      if (!sellers.has(m[1]!)) throw new ApiError(404, "not_found", "Seller not found");
      return send(res, 200, { seller: publicSeller(m[1]!) });
    }

    if (method === "POST" && path === "/v1/mandates") {
      const agentId = auth(req, "agt");
      const body = (await readJson(req)) as Record<string, unknown>;
      const sellerId = str(body.sellerId, "sellerId");
      const max = micros(body.maxPerPeriodMicros, "maxPerPeriodMicros");
      if (typeof body.period !== "string" || !PERIODS.has(body.period)) {
        throw new ApiError(422, "validation_failed", 'period must be "day", "week", or "month"');
      }
      const period = body.period as Mandate["period"];
      const agent = activeAgent(agentId);
      if (!sellers.has(sellerId)) throw new ApiError(404, "not_found", "Seller not found");
      checkCreateRules(agentId, sellerId, null);
      checkPolicy(agent.businessId);
      const biz = businesses.get(agent.businessId)!;
      const id = newId("mdt");
      const iat = Math.floor(now() / 1000);
      const token = await signToken({
        iss: url0, sub: agentId, aud: sellerId, jti: id, iat, exp: iat + 365 * 86400, env: "test",
        biz: { id: biz.id, name: biz.name, email: biz.email, verified: biz.verified },
        agent: { id: agent.id, name: agent.name },
        cur: "USD", maxPerPeriod: max.toString(), period,
      }, { typ: "gaitway-mandate+jwt" });
      const rec: MandateRec = {
        id, walletId: agent.walletId, agentId, sellerId, maxPerPeriodMicros: max.toString(), period,
        status: "active", createdAt: new Date(iat * 1000).toISOString(), max, token,
      };
      mandates.set(id, rec);
      return send(res, 200, { mandate: publicMandate(rec, true) });
    }

    if (method === "POST" && path === "/v1/mandate-charges") {
      const sellerId = auth(req, "sel");
      return idempotent(req, res, `sel:${sellerId}:mandate-charges`,
        (b) => [b.mandateId, b.amountMicros, b.description ?? null],
        (body) => {
          const mandateId = str(body.mandateId, "mandateId");
          const amount = micros(body.amountMicros, "amountMicros");
          if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
            throw new ApiError(422, "validation_failed", "description must be a string");
          }
          const md = mandates.get(mandateId);
          if (!md) throw new ApiError(404, "not_found", "Mandate not found");
          if (md.sellerId !== sellerId) throw new ApiError(403, "forbidden", "This mandate names a different seller");
          if (md.status !== "active") throw new ApiError(409, "credential_not_active", "Mandate is revoked");
          const from = periodStart(md.period, now());
          const used = charges
            .filter((c) => c.mandateId === md.id && c.atMs >= from)
            .reduce((sum, c) => sum + BigInt(c.amountMicros), 0n);
          if (used + amount > md.max) {
            throw new ApiError(409, "amount_exceeds_remaining", "Charge would exceed the mandate's limit for this period", {
              remainingMicros: (md.max - used).toString(),
            });
          }
          checkDaily(md.agentId, amount);
          const w = wallets.get(md.agentId)!;
          if (w.available < amount) throw new ApiError(402, "insufficient_funds", "Wallet balance is too low for this charge");
          w.available -= amount;
          sellers.get(sellerId)!.owed += amount;
          const charge = recordCharge({
            credentialId: null, mandateId: md.id, sellerId, agentId: md.agentId, amountMicros: amount.toString(),
            description: (body.description as string | null | undefined) ?? null,
          });
          return { charge };
        });
    }

    if (method === "POST" && path === "/v1/transfers") {
      const agentId = auth(req, "agt");
      return idempotent(req, res, `agt:${agentId}:transfers`,
        (b) => [b.sellerId, b.amountMicros, b.reference ?? null],
        (body) => {
          const sellerId = str(body.sellerId, "sellerId");
          const amount = micros(body.amountMicros, "amountMicros");
          if (body.reference !== undefined && body.reference !== null && typeof body.reference !== "string") {
            throw new ApiError(422, "validation_failed", "reference must be a string");
          }
          const agent = activeAgent(agentId);
          const seller = sellers.get(sellerId);
          if (!seller) throw new ApiError(404, "not_found", "Seller not found");
          checkCreateRules(agentId, sellerId, amount);
          checkDaily(agentId, amount);
          checkPolicy(agent.businessId);
          const w = wallets.get(agentId)!;
          if (w.available < amount) throw new ApiError(402, "insufficient_funds", "Wallet balance is too low for this transfer");
          w.available -= amount;
          seller.owed += amount;
          const charge = recordCharge({
            credentialId: null, mandateId: null, sellerId, agentId, amountMicros: amount.toString(),
            description: (body.reference as string | null | undefined) ?? null,
          });
          return { charge };
        });
    }

    if (method === "POST" && path === "/v1/refunds") {
      const sellerId = auth(req, "sel");
      return idempotent(req, res, `sel:${sellerId}:refunds`,
        (b) => [b.chargeId, b.amountMicros ?? null],
        (body) => {
          const chargeId = str(body.chargeId, "chargeId");
          const c = charges.find((x) => x.id === chargeId);
          if (!c) throw new ApiError(404, "not_found", "Charge not found");
          if (c.sellerId !== sellerId) throw new ApiError(403, "forbidden", "This charge belongs to another seller");
          const left = BigInt(c.amountMicros) - BigInt(c.refundedMicros);
          const amount = body.amountMicros === undefined || body.amountMicros === null
            ? left : micros(body.amountMicros, "amountMicros");
          if (amount <= 0n || amount > left) {
            throw new ApiError(409, "amount_exceeds_remaining", "Refund is larger than what is left of the charge", {
              remainingMicros: left.toString(),
            });
          }
          const seller = sellers.get(sellerId)!;
          if (seller.owed < amount) {
            throw new ApiError(409, "insufficient_seller_balance", "Refund is larger than the seller's unsettled balance");
          }
          seller.owed -= amount;
          wallets.get(c.agentId)!.available += amount;
          c.refundedMicros = (BigInt(c.refundedMicros) + amount).toString();
          const refund: Refund = { id: newId("rfd"), chargeId, amountMicros: amount.toString(), createdAt: new Date(now()).toISOString() };
          refunds.push(refund);
          return { refund };
        });
    }

    throw new ApiError(404, "not_found", `No route for ${method} ${path}`);
  }

  const server: Server = createServer((req, res) => {
    route(req, res).catch((err) => {
      if (err instanceof ApiError) {
        const error: Record<string, unknown> = { code: err.code, message: err.message };
        if (err.details !== undefined) error.details = err.details;
        return send(res, err.status, { error });
      }
      send(res, 500, { error: { code: "internal_error", message: String((err as Error)?.message ?? err) } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const url0 = `http://127.0.0.1:${port}`;

  return {
    url: url0,
    port,
    jwks,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
    addBusiness(o = {}) {
      const id = newId("biz");
      const rec = {
        id, name: o.name ?? "Test Business", email: o.email ?? `${id}@example.test`,
        verified: o.verified ?? false, apiKey: addKey("biz", id),
      };
      businesses.set(id, rec);
      return { id, name: rec.name, email: rec.email, apiKey: rec.apiKey };
    },
    addAgent(businessId, balance, name = "Agent") {
      if (!businesses.has(businessId)) throw new Error(`Unknown business ${businessId}`);
      const id = newId("agt");
      const walletId = newId("wal");
      const rec = { id, name, businessId, walletId, apiKey: addKey("agt", id), status: "active" as const };
      agents.set(id, rec);
      wallets.set(id, { walletId, agentId: id, available: BigInt(balance), held: 0n });
      return { id, name, businessId, walletId, apiKey: rec.apiKey };
    },
    addSeller(o = {}) {
      const id = newId("sel");
      const rec = { id, name: o.name ?? "Test Seller", apiKey: addKey("sel", id), owed: 0n, paidOut: 0n };
      sellers.set(id, rec);
      return { id, name: rec.name, apiKey: rec.apiKey };
    },
    wallet(agentId) {
      sweep();
      const w = wallets.get(agentId);
      if (!w) throw new Error(`Unknown agent ${agentId}`);
      return publicWallet(w);
    },
    sellerBalance(sellerId) {
      const s = sellers.get(sellerId);
      if (!s) throw new Error(`Unknown seller ${sellerId}`);
      return { owedMicros: s.owed.toString(), paidOutMicros: s.paidOut.toString() };
    },
    credential(id) {
      sweep();
      const c = creds.get(id);
      if (!c) throw new Error(`Unknown credential ${id}`);
      return publicCred(c);
    },
    advanceTime(ms) {
      offsetMs += ms;
      sweep();
    },
    setAgentStatus(agentId, status) {
      const a = agents.get(agentId);
      if (!a) throw new Error(`Unknown agent ${agentId}`);
      a.status = status;
    },
    signToken,
    addService(sellerId, o = {}) {
      if (!sellers.has(sellerId)) throw new Error(`Unknown seller ${sellerId}`);
      const svc: Service = {
        id: newId("svc"), sellerId, name: o.name ?? "Service", description: o.description ?? "",
        priceNote: o.priceNote ?? "", url: o.url ?? "https://seller.example", active: o.active ?? true,
      };
      services.set(sellerId, [...(services.get(sellerId) ?? []), svc]);
      return { ...svc };
    },
    setRules(agentId, r) {
      if (!agents.has(agentId)) throw new Error(`Unknown agent ${agentId}`);
      const full: Rules = {
        perPaymentMaxMicros: r?.perPaymentMaxMicros ?? null,
        dailyMaxMicros: r?.dailyMaxMicros ?? null,
        allowedSellerIds: r?.allowedSellerIds ? [...r.allowedSellerIds] : null,
      };
      if (r === null) rules.delete(agentId);
      else rules.set(agentId, full);
      return { ...full };
    },
    setPolicyOutcome(businessId, outcome) {
      if (!businesses.has(businessId)) throw new Error(`Unknown business ${businessId}`);
      if (outcome === null) policy.delete(businessId);
      else policy.set(businessId, { ...outcome, reasons: [...outcome.reasons] });
    },
    mandate(id) {
      const md = mandates.get(id);
      if (!md) throw new Error(`Unknown mandate ${id}`);
      return publicMandate(md);
    },
    revokeMandate(id) {
      const md = mandates.get(id);
      if (!md) throw new Error(`Unknown mandate ${id}`);
      md.status = "revoked";
      return publicMandate(md);
    },
    settleSeller(sellerId) {
      const s = sellers.get(sellerId);
      if (!s) throw new Error(`Unknown seller ${sellerId}`);
      s.paidOut += s.owed;
      s.owed = 0n;
    },
  };
}
