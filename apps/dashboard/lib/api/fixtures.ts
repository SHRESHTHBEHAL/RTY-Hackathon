/**
 * In-memory fixture backend. It answers the HTTP contract in context.md
 * section 8 (M1 and M2 routes) with the same status codes, error codes and
 * rules as the real API, so screens built on fixtures behave the same way
 * against the live API.
 *
 * The store lives at module level on the server (pinned to globalThis so dev
 * reloads keep it). It is seeded with:
 *
 *   Business "Acme Ops"   log in: ops@acme.test   / fixture-password
 *     agents Scout ($50.00), Buyer ($30.00), Broke ($0.00); $20.00 unallocated
 *   Seller "Relay"        log in: team@relay.test / fixture-password
 *     one service, about a week of one-cent charges, three payouts
 *
 * These are fixture-only test logins; they do not exist anywhere else.
 *
 * Differences from the real API, on purpose:
 *  - Top-ups confirm about 1.5 seconds after creation (no chain).
 *  - Withdrawals and payouts are marked sent at once.
 *  - Credential and mandate tokens are opaque placeholders, not signed JWTs.
 *  - The policy hook URL is stored but never called.
 */
import { createHash, randomBytes } from "node:crypto";
import type {
  Account,
  Agent,
  ApiKey,
  Charge,
  Credential,
  Mandate,
  Payout,
  Refund,
  Rules,
  Service,
  Topup,
  Transaction,
  Wallet,
  Withdrawal,
} from "./types";

/* ------------------------------------------------------------------ */
/* Public surface                                                      */
/* ------------------------------------------------------------------ */

export type FixtureRequest = {
  method: string;
  /** Path with query, e.g. "/v1/transactions?walletId=wal_x" */
  path: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
};

export type FixtureResponse = { status: number; body: unknown };

export const FIXTURE_LOGINS = {
  business: { email: "ops@acme.test", password: "fixture-password" },
  seller: { email: "team@relay.test", password: "fixture-password" },
} as const;

export async function fixtureFetch(req: FixtureRequest): Promise<FixtureResponse> {
  const latency = Number(process.env.FIXTURE_LATENCY_MS ?? 0);
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));
  const s = store();
  try {
    tick(s, Date.now());
    return handle(s, req);
  } catch (e) {
    if (e instanceof HttpError) {
      const error: Record<string, unknown> = { code: e.code, message: e.message };
      if (e.details) error.details = e.details;
      return { status: e.status, body: { error } };
    }
    console.error("[fixtures] unexpected error", e);
    return { status: 500, body: { error: { code: "internal", message: "Fixture backend error" } } };
  }
}

/** Throw away all state and re-seed. For tests. */
export function resetFixtures(): void {
  (globalThis as GlobalWithStore)[STORE_KEY] = seed(createStore(), Date.now());
}

/** Seeded IDs and keys, stable across restarts. For tests and the demo screen. */
export function fixtureSeedInfo() {
  return store().seedInfo;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type KeyOwner = { type: "business"; id: string } | { type: "seller"; id: string } | { type: "agent"; id: string };

type KeyRec = ApiKey & { owner: KeyOwner; hash: string; env: "test" };

type AccountRec = { account: Account; passwordHash: string; salt: string };

type BusinessRec = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  unallocated: bigint;
  topups: Topup[];
  withdrawals: Withdrawal[];
  transactions: Transaction[];
  policyHook: { url: string; secret: string } | null;
};

type AgentRec = {
  agent: Agent;
  businessId: string;
  available: bigint;
  held: bigint;
  rules: Rules;
};

type SellerRec = {
  id: string;
  name: string;
  owed: bigint; // unsettled, net of fees and refunds
  paidOut: bigint;
  payoutAddress: string;
  webhook: { url: string; secret: string } | null;
  services: Service[];
};

type CredRec = Credential & { remaining: bigint; held: bigint };

type IdemRec = { bodyKey: string; response: FixtureResponse };

type Store = {
  accounts: Map<string, AccountRec>;
  emails: Map<string, string>;
  sessions: Map<string, string>;
  keys: Map<string, KeyRec>;
  businesses: Map<string, BusinessRec>;
  agents: Map<string, AgentRec>;
  wallets: Map<string, string>; // walletId -> agentId
  sellers: Map<string, SellerRec>;
  credentials: Map<string, CredRec>;
  charges: Charge[];
  payouts: Payout[];
  refunds: Refund[];
  mandates: Map<string, Mandate>;
  idempotency: Map<string, IdemRec>;
  rand: () => number;
  seedInfo: SeedInfo;
};

type SeedInfo = {
  businessId: string;
  sellerId: string;
  agents: { scout: string; buyer: string; broke: string };
  wallets: { scout: string; buyer: string; broke: string };
  keys: { business: string; seller: string; agents: string[] };
};

const STORE_KEY = "__gaitwayFixtureStore__";
type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: Store };

function store(): Store {
  const g = globalThis as GlobalWithStore;
  if (!g[STORE_KEY]) g[STORE_KEY] = seed(createStore(), Date.now());
  return g[STORE_KEY]!;
}

function createStore(): Store {
  return {
    accounts: new Map(),
    emails: new Map(),
    sessions: new Map(),
    keys: new Map(),
    businesses: new Map(),
    agents: new Map(),
    wallets: new Map(),
    sellers: new Map(),
    credentials: new Map(),
    charges: [],
    payouts: [],
    refunds: [],
    mandates: new Map(),
    idempotency: new Map(),
    rand: Math.random,
    seedInfo: {} as SeedInfo,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const err = {
  unauthorized: (m = "Missing or invalid session or key.") => new HttpError(401, "unauthorized", m),
  forbidden: (m = "This key or session cannot do that.") => new HttpError(403, "forbidden", m),
  notFound: (what = "Resource") => new HttpError(404, "not_found", `${what} not found.`),
  validation: (m: string, field?: string) =>
    new HttpError(422, "validation_failed", m, field ? { field } : undefined),
  funds: (m = "Not enough balance.") => new HttpError(402, "insufficient_funds", m),
};

const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function randChars(s: Store, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += B36[Math.floor(s.rand() * 36)];
  return out;
}

function newId(s: Store, prefix: string): string {
  return `${prefix}_${randChars(s, 24)}`;
}

function hex(s: Store, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += "0123456789abcdef"[Math.floor(s.rand() * 16)];
  return out;
}

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function mulberry32(seedValue: number): () => number {
  let a = seedValue >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (t: number) => new Date(t).toISOString();
const m = (v: bigint) => v.toString();
const FEE_BPS = BigInt(process.env.PLATFORM_FEE_BPS ?? 0);
const fee = (amount: bigint) => (amount * FEE_BPS) / 10000n;

function obj(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object" || Array.isArray(body)) throw err.validation("Body must be a JSON object.");
  return body as Record<string, unknown>;
}

function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v === undefined && opts.optional) return "";
  if (typeof v !== "string") throw err.validation(`${field} is required.`, field);
  const t = v.trim();
  if (t.length < (opts.min ?? 1)) throw err.validation(`${field} is too short.`, field);
  if (t.length > (opts.max ?? 200)) throw err.validation(`${field} is too long.`, field);
  return t;
}

function microsField(v: unknown, field: string, opts: { allowZero?: boolean } = {}): bigint {
  if (typeof v !== "string" || !/^\d+$/.test(v)) throw err.validation(`${field} must be a string of digits.`, field);
  const n = BigInt(v);
  if (n === 0n && !opts.allowZero) throw err.validation(`${field} must be more than zero.`, field);
  if (n > 1_000_000_000_000_000n) throw err.validation(`${field} is too large.`, field);
  return n;
}

function urlField(v: unknown, field: string): string {
  const u = str(v, field, { max: 2000 });
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
  } catch {
    throw err.validation(`${field} must be an http or https URL.`, field);
  }
  return u;
}

function paginate<T>(items: T[], query: URLSearchParams): { data: T[]; nextCursor: string | null } {
  const limitRaw = query.get("limit");
  const limit = limitRaw === null || limitRaw === "" ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw err.validation("limit must be 1 to 200.", "limit");
  const cursorRaw = query.get("cursor");
  const start = cursorRaw ? Number(cursorRaw) : 0;
  if (!Number.isInteger(start) || start < 0) throw err.validation("Invalid cursor.", "cursor");
  const data = items.slice(start, start + limit);
  const next = start + limit < items.length ? String(start + limit) : null;
  return { data, nextCursor: next };
}

const newestFirst = <T extends { createdAt: string }>(a: T[]) =>
  [...a].sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));

function publicKey(k: KeyRec): ApiKey {
  return { id: k.id, label: k.label, lastFour: k.lastFour, createdAt: k.createdAt };
}

function issueKey(s: Store, owner: KeyOwner, label: string, at: number, fixedSecret?: string): { key: ApiKey; apiKey: string } {
  const tag = owner.type === "business" ? "biz" : owner.type === "seller" ? "sel" : "agt";
  const apiKey = fixedSecret ?? `gw_test_${tag}_${randChars(s, 32)}`;
  const rec: KeyRec = {
    id: newId(s, "key"),
    label,
    lastFour: apiKey.slice(-4),
    createdAt: iso(at),
    owner,
    hash: sha256(apiKey),
    env: "test",
  };
  s.keys.set(rec.hash, rec);
  return { key: publicKey(rec), apiKey };
}

function walletOf(a: AgentRec): Wallet {
  return { walletId: a.agent.walletId, agentId: a.agent.id, availableMicros: m(a.available), heldMicros: m(a.held) };
}

function credOut(c: CredRec, withToken = false): Credential {
  const out: Credential = {
    id: c.id,
    sellerId: c.sellerId,
    agentId: c.agentId,
    businessId: c.businessId,
    maxMicros: c.maxMicros,
    remainingMicros: m(c.remaining),
    status: c.status,
    expiresAt: c.expiresAt,
  };
  if (withToken && c.token) out.token = c.token;
  return out;
}

function placeholderToken(kind: "credential" | "mandate", claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = { alg: "ES256", kid: "fixture", typ: `gaitway-${kind}+jwt` };
  return `${enc(header)}.${enc(claims)}.fixture-signature-not-valid`;
}

function addTx(b: BusinessRec, s: Store, tx: Omit<Transaction, "id">) {
  b.transactions.push({ id: newId(s, "txn"), ...tx });
}

/* ------------------------------------------------------------------ */
/* Time-driven state: top-up confirmation, credential expiry           */
/* ------------------------------------------------------------------ */

const TOPUP_CONFIRM_MS = 1500;

function tick(s: Store, now: number) {
  for (const b of s.businesses.values()) {
    for (const t of b.topups) {
      if (t.status === "pending" && now - Date.parse(t.createdAt) >= TOPUP_CONFIRM_MS) {
        t.status = "confirmed";
        t.txHash = `0x${hex(s, 64)}`;
        b.unallocated += BigInt(t.amountMicros);
        addTx(b, s, {
          type: "topup",
          walletId: null,
          amountMicros: t.amountMicros,
          counterparty: null,
          createdAt: iso(Math.max(now, Date.parse(t.createdAt) + TOPUP_CONFIRM_MS)),
        });
      }
    }
  }
  for (const c of s.credentials.values()) {
    if (c.status === "active" && Date.parse(c.expiresAt) <= now) {
      releaseHold(s, c, "expired", now);
    }
  }
}

function releaseHold(s: Store, c: CredRec, status: Credential["status"], at: number) {
  const a = s.agents.get(c.agentId);
  const b = s.businesses.get(c.businessId);
  if (a && c.held > 0n) {
    a.held -= c.held;
    a.available += c.held;
    if (b) {
      addTx(b, s, {
        type: "release",
        walletId: a.agent.walletId,
        amountMicros: m(c.held),
        counterparty: s.sellers.get(c.sellerId)?.name ?? null,
        createdAt: iso(at),
      });
    }
  }
  c.held = 0n;
  c.status = status;
}

/* ------------------------------------------------------------------ */
/* Principals                                                          */
/* ------------------------------------------------------------------ */

type Principal =
  | { type: "business"; businessId: string; accountId: string | null }
  | { type: "seller"; sellerId: string; accountId: string | null }
  | { type: "agent"; agentId: string };

function authenticate(s: Store, headers: Record<string, string | undefined>): Principal {
  const raw = headers.authorization ?? headers.Authorization;
  const match = raw ? /^Bearer\s+(.+)$/i.exec(raw) : null;
  if (!match) throw err.unauthorized();
  const token = match[1]!.trim();
  if (token.startsWith("gw_live_")) throw new HttpError(403, "live_disabled", "Live mode is not enabled.");
  if (token.startsWith("gws_")) {
    const accountId = s.sessions.get(token);
    const rec = accountId ? s.accounts.get(accountId) : undefined;
    if (!rec) throw err.unauthorized("Session has ended. Log in again.");
    const a = rec.account;
    return a.kind === "business"
      ? { type: "business", businessId: a.businessId!, accountId: a.id }
      : { type: "seller", sellerId: a.sellerId!, accountId: a.id };
  }
  const k = s.keys.get(sha256(token));
  if (!k) throw err.unauthorized();
  if (k.owner.type === "business") return { type: "business", businessId: k.owner.id, accountId: null };
  if (k.owner.type === "seller") return { type: "seller", sellerId: k.owner.id, accountId: null };
  return { type: "agent", agentId: k.owner.id };
}

function asBusiness(s: Store, p: Principal): BusinessRec {
  if (p.type !== "business") throw err.forbidden("This route needs a business session or key.");
  const b = s.businesses.get(p.businessId);
  if (!b) throw err.unauthorized();
  return b;
}

function asSeller(s: Store, p: Principal): SellerRec {
  if (p.type !== "seller") throw err.forbidden("This route needs a seller session or key.");
  const r = s.sellers.get(p.sellerId);
  if (!r) throw err.unauthorized();
  return r;
}

function asAgent(s: Store, p: Principal): AgentRec {
  if (p.type !== "agent") throw err.forbidden("This route needs an agent key.");
  const a = s.agents.get(p.agentId);
  if (!a) throw err.unauthorized();
  return a;
}

function agentOfBusiness(s: Store, b: BusinessRec, id: string): AgentRec {
  const a = s.agents.get(id);
  if (!a || a.businessId !== b.id) throw err.notFound("Agent");
  return a;
}

/* ------------------------------------------------------------------ */
/* Core operations (also used by the seed, with an explicit clock)     */
/* ------------------------------------------------------------------ */

function opCreateAccount(
  s: Store,
  input: { email: string; password: string; name: string; kind: "business" | "seller" },
  at: number,
  fixed?: { apiKey?: string },
) {
  const email = input.email.toLowerCase();
  if (s.emails.has(email)) throw err.validation("An account with this email already exists.", "email");
  const salt = randChars(s, 12);
  const account: Account = {
    id: newId(s, "acc"),
    email,
    name: input.name,
    kind: input.kind,
    businessId: null,
    sellerId: null,
  };
  let issued: { key: ApiKey; apiKey: string };
  if (input.kind === "business") {
    const b: BusinessRec = {
      id: newId(s, "biz"),
      name: input.name,
      email,
      verified: false,
      unallocated: 0n,
      topups: [],
      withdrawals: [],
      transactions: [],
      policyHook: null,
    };
    s.businesses.set(b.id, b);
    account.businessId = b.id;
    issued = issueKey(s, { type: "business", id: b.id }, "Default key", at, fixed?.apiKey);
  } else {
    const r: SellerRec = {
      id: newId(s, "sel"),
      name: input.name,
      owed: 0n,
      paidOut: 0n,
      payoutAddress: `0x${hex(s, 40)}`,
      webhook: null,
      services: [],
    };
    s.sellers.set(r.id, r);
    account.sellerId = r.id;
    issued = issueKey(s, { type: "seller", id: r.id }, "Default key", at, fixed?.apiKey);
  }
  s.accounts.set(account.id, { account, salt, passwordHash: sha256(salt + input.password) });
  s.emails.set(email, account.id);
  const sessionToken = `gws_${randChars(s, 40)}`;
  s.sessions.set(sessionToken, account.id);
  return { account, sessionToken, apiKey: issued.apiKey };
}

function opCreateAgent(s: Store, b: BusinessRec, name: string, at: number, fixedKey?: string) {
  const agent: Agent = {
    id: newId(s, "agt"),
    name,
    walletId: newId(s, "wal"),
    status: "active",
    createdAt: iso(at),
  };
  s.agents.set(agent.id, {
    agent,
    businessId: b.id,
    available: 0n,
    held: 0n,
    rules: { perPaymentMaxMicros: null, dailyMaxMicros: null, allowedSellerIds: null },
  });
  s.wallets.set(agent.walletId, agent.id);
  const { apiKey } = issueKey(s, { type: "agent", id: agent.id }, "Default key", at, fixedKey);
  return { agent, apiKey };
}

function opTopup(s: Store, b: BusinessRec, amount: bigint, at: number, confirmNow: boolean): Topup {
  const t: Topup = {
    id: newId(s, "top"),
    amountMicros: m(amount),
    method: "test",
    status: "pending",
    txHash: null,
    createdAt: iso(at),
  };
  b.topups.push(t);
  if (confirmNow) {
    t.status = "confirmed";
    t.txHash = `0x${hex(s, 64)}`;
    b.unallocated += amount;
    addTx(b, s, { type: "topup", walletId: null, amountMicros: t.amountMicros, counterparty: null, createdAt: iso(at) });
  }
  return t;
}

function opAllocate(s: Store, b: BusinessRec, a: AgentRec, amount: bigint, direction: "to_wallet" | "to_unallocated", at: number) {
  if (direction === "to_wallet") {
    if (b.unallocated < amount) throw err.funds("Not enough unallocated balance. Top up first.");
    b.unallocated -= amount;
    a.available += amount;
  } else {
    if (a.available < amount) throw err.funds("Not enough available balance in this wallet.");
    a.available -= amount;
    b.unallocated += amount;
  }
  addTx(b, s, {
    type: "allocation",
    walletId: a.agent.walletId,
    amountMicros: direction === "to_wallet" ? m(amount) : m(-amount),
    counterparty: a.agent.name,
    createdAt: iso(at),
  });
}

function utcDayStart(at: number) {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function spentToday(s: Store, agentId: string, at: number): bigint {
  const start = utcDayStart(at);
  let total = 0n;
  for (const c of s.charges) {
    if (c.agentId === agentId && Date.parse(c.createdAt) >= start) total += BigInt(c.amountMicros) - BigInt(c.refundedMicros);
  }
  return total;
}

function checkCreateRules(a: AgentRec, sellerId: string, amount: bigint) {
  const r = a.rules;
  if (r.allowedSellerIds && !r.allowedSellerIds.includes(sellerId)) {
    throw new HttpError(403, "rule_violation", "This seller is not on the agent's allowed list.", {
      outcome: "block",
      approvalLink: null,
    });
  }
  if (r.perPaymentMaxMicros !== null && amount > BigInt(r.perPaymentMaxMicros)) {
    throw new HttpError(403, "rule_violation", "Amount is above the agent's per-payment limit.", {
      outcome: "block",
      approvalLink: null,
    });
  }
}

function checkDailyRule(s: Store, a: AgentRec, amount: bigint, at: number) {
  const max = a.rules.dailyMaxMicros;
  if (max !== null && spentToday(s, a.agent.id, at) + amount > BigInt(max)) {
    throw new HttpError(403, "rule_violation", "This payment would pass the agent's daily limit.", {
      outcome: "block",
      approvalLink: null,
    });
  }
}

function opCreateCredential(s: Store, a: AgentRec, sellerId: string, max: bigint, ttlSeconds: number, at: number): CredRec {
  if (a.agent.status !== "active") throw err.forbidden("This agent is disabled.");
  const seller = s.sellers.get(sellerId);
  if (!seller) throw err.notFound("Seller");
  checkCreateRules(a, sellerId, max);
  if (a.available < max) throw err.funds("Wallet balance is below the requested maximum.");
  const b = s.businesses.get(a.businessId)!;
  const id = newId(s, "crd");
  const exp = at + ttlSeconds * 1000;
  const c: CredRec = {
    id,
    sellerId,
    agentId: a.agent.id,
    businessId: b.id,
    maxMicros: m(max),
    remainingMicros: m(max),
    remaining: max,
    held: max,
    status: "active",
    expiresAt: iso(exp),
    token: placeholderToken("credential", {
      iss: "fixtures",
      sub: a.agent.id,
      aud: sellerId,
      jti: id,
      iat: Math.floor(at / 1000),
      exp: Math.floor(exp / 1000),
      env: "test",
      biz: { id: b.id, name: b.name, email: b.email, verified: b.verified },
      agent: { id: a.agent.id, name: a.agent.name },
      max: m(max),
      cur: "USD",
    }),
  };
  a.available -= max;
  a.held += max;
  s.credentials.set(id, c);
  addTx(b, s, { type: "hold", walletId: a.agent.walletId, amountMicros: m(-max), counterparty: seller.name, createdAt: iso(at) });
  return c;
}

function opCharge(
  s: Store,
  seller: SellerRec,
  input: { credentialId: string; amount: bigint; final: boolean; description: string | null },
  at: number,
) {
  const c = s.credentials.get(input.credentialId);
  if (!c) throw err.notFound("Credential");
  if (c.sellerId !== seller.id) throw err.forbidden("This credential names a different seller.");
  if (c.status === "active" && Date.parse(c.expiresAt) <= at) releaseHold(s, c, "expired", at);
  if (c.status === "expired") throw new HttpError(409, "credential_expired", "This credential has expired.");
  if (c.status !== "active") throw new HttpError(409, "credential_not_active", "This credential is released or used up.");
  if (input.amount > c.remaining) {
    throw new HttpError(409, "amount_exceeds_remaining", "Charge is larger than what is left on the credential.", {
      remainingMicros: m(c.remaining),
    });
  }
  const a = s.agents.get(c.agentId)!;
  checkDailyRule(s, a, input.amount, at);
  const b = s.businesses.get(c.businessId)!;
  const f = fee(input.amount);
  c.remaining -= input.amount;
  c.held -= input.amount;
  c.remainingMicros = m(c.remaining);
  a.held -= input.amount;
  seller.owed += input.amount - f;
  const charge: Charge = {
    id: newId(s, "chg"),
    credentialId: c.id,
    mandateId: null,
    sellerId: seller.id,
    agentId: a.agent.id,
    amountMicros: m(input.amount),
    feeMicros: m(f),
    refundedMicros: "0",
    description: input.description,
    createdAt: iso(at),
  };
  s.charges.push(charge);
  addTx(b, s, { type: "charge", walletId: a.agent.walletId, amountMicros: m(-input.amount), counterparty: seller.name, createdAt: iso(at) });
  if (input.final) releaseHold(s, c, "released", at);
  else if (c.remaining === 0n) releaseHold(s, c, "exhausted", at);
  return { charge, remainingMicros: m(c.remaining) };
}

function opPayout(s: Store, seller: SellerRec, at: number): Payout | null {
  if (seller.owed <= 0n) return null;
  const p: Payout = {
    id: newId(s, "pay"),
    sellerId: seller.id,
    amountMicros: m(seller.owed),
    status: "sent",
    txHash: `0x${hex(s, 64)}`,
    createdAt: iso(at),
  };
  seller.paidOut += seller.owed;
  seller.owed = 0n;
  s.payouts.push(p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

function seed(s: Store, now: number): Store {
  // Deterministic IDs and keys for the seed; real randomness afterwards.
  s.rand = mulberry32(0x9a17_3a7);
  const t0 = now - 7 * DAY;

  const biz = opCreateAccount(
    s,
    { email: FIXTURE_LOGINS.business.email, password: FIXTURE_LOGINS.business.password, name: "Acme Ops", kind: "business" },
    t0,
  );
  const sel = opCreateAccount(
    s,
    { email: FIXTURE_LOGINS.seller.email, password: FIXTURE_LOGINS.seller.password, name: "Relay", kind: "seller" },
    t0,
  );
  // Seed sessions are not handed out; log in to get one.
  s.sessions.clear();

  const b = s.businesses.get(biz.account.businessId!)!;
  const relay = s.sellers.get(sel.account.sellerId!)!;
  relay.services.push({
    id: newId(s, "svc"),
    sellerId: relay.id,
    name: "Relay messages",
    description: "Send a text message to a recipient. Paid per message.",
    priceNote: "$0.01 per message",
    url: "http://localhost:4000/messages",
    active: true,
  });

  const scout = opCreateAgent(s, b, "Scout", t0 + 2 * MIN);
  const buyer = opCreateAgent(s, b, "Buyer", t0 + 3 * MIN);
  const broke = opCreateAgent(s, b, "Broke", t0 + 4 * MIN);
  const A = (id: string) => s.agents.get(id)!;

  // Money in: $100 then $2. Allocations leave $20.00 unallocated once all
  // spending below is done: Scout ends at $50.00, Buyer $30.00, Broke $0.00.
  opTopup(s, b, 100_000_000n, t0 + 10 * MIN, true);
  opAllocate(s, b, A(scout.agent.id), 51_240_000n, "to_wallet", t0 + 12 * MIN);
  opAllocate(s, b, A(buyer.agent.id), 30_610_000n, "to_wallet", t0 + 13 * MIN);
  opAllocate(s, b, A(broke.agent.id), 150_000n, "to_wallet", t0 + 14 * MIN);
  opTopup(s, b, 2_000_000n, t0 + 4 * DAY + 3 * HOUR, true);

  // Sessions: [agent, start offset, messages, hold]. One cent per message.
  const CENT = 10_000n;
  type Sess = [string, number, number, bigint];
  const sessions: Sess[] = [
    [scout.agent.id, 0 * DAY + 5 * HOUR, 20, 1_000_000n],
    [buyer.agent.id, 1 * DAY + 2 * HOUR, 15, 1_000_000n],
    [scout.agent.id, 1 * DAY + 9 * HOUR, 18, 1_000_000n],
    [broke.agent.id, 2 * DAY + 4 * HOUR, 15, 150_000n],
    [scout.agent.id, 2 * DAY + 11 * HOUR, 25, 1_000_000n],
    [buyer.agent.id, 3 * DAY + 6 * HOUR, 21, 1_000_000n],
    [scout.agent.id, 4 * DAY + 8 * HOUR, 16, 1_000_000n],
    [scout.agent.id, 5 * DAY + 3 * HOUR, 22, 1_000_000n],
    [buyer.agent.id, 5 * DAY + 10 * HOUR, 25, 1_000_000n],
    [scout.agent.id, 6 * DAY + 7 * HOUR, 23, 1_000_000n],
  ];
  const payoutsAt = [2 * DAY + 20 * HOUR, 4 * DAY + 20 * HOUR, 5 * DAY + 20 * HOUR];

  type Ev = { at: number; run: () => void };
  const events: Ev[] = [];
  for (const [agentId, start, count, hold] of sessions) {
    const at0 = t0 + start;
    let cred: CredRec | null = null;
    events.push({ at: at0, run: () => (cred = opCreateCredential(s, A(agentId), relay.id, hold, 3 * HOUR, at0)) });
    let t = at0;
    for (let i = 0; i < count; i++) {
      t += 20_000 + Math.floor(s.rand() * 70_000);
      const at = t;
      events.push({
        at,
        run: () => opCharge(s, relay, { credentialId: cred!.id, amount: CENT, final: false, description: "1 message" }, at),
      });
    }
    const end = t + 5_000;
    events.push({
      at: end,
      run: () => {
        if (cred && cred.status === "active") releaseHold(s, cred, "released", end);
      },
    });
  }
  for (const off of payoutsAt) events.push({ at: t0 + off, run: () => void opPayout(s, relay, t0 + off) });
  events.sort((x, y) => x.at - y.at);
  for (const e of events) e.run();

  // Two standing subscriptions (mandates) to Relay, so the business has some to see and revoke.
  const seedMandates: Array<[string, bigint, Mandate["period"], number]> = [
    [scout.agent.id, 5_000_000n, "month", t0 + 1 * DAY],
    [buyer.agent.id, 2_000_000n, "week", t0 + 3 * DAY],
  ];
  for (const [agentId, max, period, at] of seedMandates) {
    const a = A(agentId);
    const id = newId(s, "mdt");
    s.mandates.set(id, {
      id,
      walletId: a.agent.walletId,
      agentId,
      sellerId: relay.id,
      maxPerPeriodMicros: m(max),
      period,
      status: "active",
      createdAt: iso(at),
      token: placeholderToken("mandate", { sub: agentId, aud: relay.id, jti: id, maxPerPeriod: m(max), period }),
    });
  }

  // Keys for the demo screen and tests (fixture only).
  const keys = {
    business: biz.apiKey,
    seller: sel.apiKey,
    agents: [scout.apiKey, buyer.apiKey, broke.apiKey],
  };
  s.seedInfo = {
    businessId: b.id,
    sellerId: relay.id,
    agents: { scout: scout.agent.id, buyer: buyer.agent.id, broke: broke.agent.id },
    wallets: { scout: scout.agent.walletId, buyer: buyer.agent.walletId, broke: broke.agent.walletId },
    keys,
  };

  s.rand = () => randomBytes(1)[0]! / 256;
  return s;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

type Ctx = {
  s: Store;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string | undefined>;
  principal: () => Principal;
  now: number;
};

type Handler = (c: Ctx) => FixtureResponse | { [k: string]: unknown };

const routes: Array<[string, string, Handler, { idempotent?: boolean }?]> = [];
const route = (method: string, pattern: string, h: Handler, o?: { idempotent?: boolean }) => routes.push([method, pattern, h, o]);

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split("/");
  const ap = path.split("/");
  if (pp.length !== ap.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i]!;
    const val = ap[i]!;
    if (seg.startsWith(":")) {
      if (!val) return null;
      params[seg.slice(1)] = decodeURIComponent(val);
    } else if (seg !== val) return null;
  }
  return params;
}

function lowerHeaders(h: Record<string, string | undefined> = {}) {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

function handle(s: Store, req: FixtureRequest): FixtureResponse {
  const url = new URL(req.path, "http://fixtures.local");
  const method = req.method.toUpperCase();
  const headers = lowerHeaders(req.headers);
  let pathMatched = false;
  for (const [rm, pattern, h, opts] of routes) {
    const params = matchPath(pattern, url.pathname);
    if (!params) continue;
    pathMatched = true;
    if (rm !== method) continue;
    let principalCache: Principal | null = null;
    const ctx: Ctx = {
      s,
      params,
      query: url.searchParams,
      body: req.body,
      headers,
      now: Date.now(),
      principal: () => (principalCache ??= authenticate(s, headers)),
    };
    if (opts?.idempotent) {
      const key = headers["idempotency-key"];
      if (!key) throw err.validation("Idempotency-Key header is required.", "Idempotency-Key");
      const p = ctx.principal();
      const who = p.type === "agent" ? p.agentId : p.type === "seller" ? p.sellerId : p.businessId;
      const scope = `${who}:${method}:${pattern}:${key}`;
      const bodyKey = JSON.stringify(req.body ?? null);
      const prior = s.idempotency.get(scope);
      if (prior) {
        if (prior.bodyKey !== bodyKey) {
          throw new HttpError(409, "idempotency_conflict", "This Idempotency-Key was used with a different body.");
        }
        return prior.response;
      }
      const response = toResponse(h(ctx));
      if (response.status < 500) s.idempotency.set(scope, { bodyKey, response });
      return response;
    }
    return toResponse(h(ctx));
  }
  if (pathMatched) return { status: 404, body: { error: { code: "not_found", message: `No ${method} on this route.` } } };
  throw err.notFound("Route");
}

function toResponse(r: FixtureResponse | { [k: string]: unknown }): FixtureResponse {
  if (r && typeof r === "object" && "status" in r && "body" in r && typeof r.status === "number") return r as FixtureResponse;
  return { status: 200, body: r };
}

const created = (body: unknown): FixtureResponse => ({ status: 201, body });

/* ---- Public ---- */

route("GET", "/health", () => ({ ok: true }));

route("GET", "/.well-known/jwks.json", () => ({
  keys: [{ kty: "EC", crv: "P-256", kid: "fixture", use: "sig", alg: "ES256", x: "fixture-x", y: "fixture-y" }],
}));

route("POST", "/v1/accounts", ({ s, body, now }) => {
  const b = obj(body);
  const kind = b.kind;
  if (kind !== "business" && kind !== "seller") throw err.validation("kind must be business or seller.", "kind");
  const email = str(b.email, "email", { max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err.validation("Enter a valid email address.", "email");
  if (typeof b.password !== "string" || b.password.length < 8) {
    throw err.validation("Password must be at least 8 characters.", "password");
  }
  const name = str(b.name, "name", { max: 80 });
  return created(opCreateAccount(s, { email, password: b.password, name, kind }, now));
});

route("POST", "/v1/sessions", ({ s, body }) => {
  const b = obj(body);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const id = s.emails.get(email);
  const rec = id ? s.accounts.get(id) : undefined;
  if (!rec || rec.passwordHash !== sha256(rec.salt + password)) {
    throw err.unauthorized("Email or password is wrong.");
  }
  const sessionToken = `gws_${randChars(s, 40)}`;
  s.sessions.set(sessionToken, rec.account.id);
  return created({ account: rec.account, sessionToken });
});

function sellerOut(r: SellerRec, onlyActive: boolean) {
  return { id: r.id, name: r.name, services: r.services.filter((x) => !onlyActive || x.active) };
}

route("GET", "/v1/sellers", ({ s, query }) => {
  const q = (query.get("query") ?? "").trim().toLowerCase();
  const all = [...s.sellers.values()]
    .filter((r) => r.services.some((x) => x.active))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.services.some((x) => x.name.toLowerCase().includes(q)))
    .map((r) => sellerOut(r, true));
  return paginate(all, query);
});

route("GET", "/v1/sellers/:id", ({ s, params }) => {
  const r = s.sellers.get(params.id!);
  if (!r) throw err.notFound("Seller");
  return { seller: sellerOut(r, true) };
});

/* ---- Any session or key ---- */

route("GET", "/v1/me", ({ s, principal }) => {
  const p = principal();
  if (p.type === "agent" || !p.accountId) {
    // Keys have no account; answer with the owning account where there is one.
    const owner = [...s.accounts.values()].find((a) =>
      p.type === "business" ? a.account.businessId === p.businessId : p.type === "seller" ? a.account.sellerId === p.sellerId : false,
    );
    if (!owner) throw err.forbidden("Agent keys have no account.");
    return { account: owner.account };
  }
  return { account: s.accounts.get(p.accountId)!.account };
});

function keyOwnerOf(p: Principal): KeyOwner {
  if (p.type === "business") return { type: "business", id: p.businessId };
  if (p.type === "seller") return { type: "seller", id: p.sellerId };
  throw err.forbidden("Agent keys cannot manage keys.");
}

function keysFor(s: Store, owner: KeyOwner) {
  return newestFirst([...s.keys.values()].filter((k) => k.owner.type === owner.type && k.owner.id === owner.id)).map(publicKey);
}

route("GET", "/v1/keys", ({ s, principal, query }) => paginate(keysFor(s, keyOwnerOf(principal())), query));

route("POST", "/v1/keys", ({ s, principal, body, now }) => {
  const label = str(obj(body).label, "label", { max: 60 });
  return created(issueKey(s, keyOwnerOf(principal()), label, now));
});

route("DELETE", "/v1/keys/:id", ({ s, principal, params }) => {
  const owner = keyOwnerOf(principal());
  for (const [h, k] of s.keys) {
    if (k.id === params.id && k.owner.type === owner.type && k.owner.id === owner.id) {
      s.keys.delete(h);
      return { ok: true };
    }
  }
  throw err.notFound("Key");
});

/* ---- Business ---- */

route("POST", "/v1/agents", ({ s, principal, body, now }) => {
  const b = asBusiness(s, principal());
  const name = str(obj(body).name, "name", { max: 60 });
  return created(opCreateAgent(s, b, name, now));
});

route("GET", "/v1/agents", ({ s, principal, query }) => {
  const b = asBusiness(s, principal());
  const list = newestFirst([...s.agents.values()].filter((a) => a.businessId === b.id).map((a) => a.agent));
  return paginate(list, query);
});

route("GET", "/v1/agents/:id", ({ s, principal, params }) => {
  const a = agentOfBusiness(s, asBusiness(s, principal()), params.id!);
  return { agent: a.agent, wallet: walletOf(a) };
});

route("PATCH", "/v1/agents/:id", ({ s, principal, params, body }) => {
  const a = agentOfBusiness(s, asBusiness(s, principal()), params.id!);
  const b = obj(body);
  if (b.name !== undefined) a.agent.name = str(b.name, "name", { max: 60 });
  if (b.status !== undefined) {
    if (b.status !== "active" && b.status !== "disabled") throw err.validation("status must be active or disabled.", "status");
    a.agent.status = b.status;
  }
  return { agent: a.agent };
});

route("GET", "/v1/agents/:id/keys", ({ s, principal, params, query }) => {
  const a = agentOfBusiness(s, asBusiness(s, principal()), params.id!);
  return paginate(keysFor(s, { type: "agent", id: a.agent.id }), query);
});

route("POST", "/v1/agents/:id/keys", ({ s, principal, params, body, now }) => {
  const a = agentOfBusiness(s, asBusiness(s, principal()), params.id!);
  const label = str(obj(body).label, "label", { max: 60 });
  return created(issueKey(s, { type: "agent", id: a.agent.id }, label, now));
});

route("DELETE", "/v1/agents/:id/keys/:keyId", ({ s, principal, params }) => {
  const a = agentOfBusiness(s, asBusiness(s, principal()), params.id!);
  for (const [h, k] of s.keys) {
    if (k.id === params.keyId && k.owner.type === "agent" && k.owner.id === a.agent.id) {
      s.keys.delete(h);
      return { ok: true };
    }
  }
  throw err.notFound("Key");
});

route("GET", "/v1/balance", ({ s, principal }) => {
  const b = asBusiness(s, principal());
  const wallets = [...s.agents.values()].filter((a) => a.businessId === b.id).map(walletOf);
  return { unallocatedMicros: m(b.unallocated), wallets };
});

route("POST", "/v1/topups", ({ s, principal, body, now }) => {
  const b = asBusiness(s, principal());
  const o = obj(body);
  const amount = microsField(o.amountMicros, "amountMicros");
  if (o.method !== "test" && o.method !== "ramp") throw err.validation("method must be test or ramp.", "method");
  if (o.method === "ramp") throw err.validation("Card and bank top-ups are not available yet. Use test money.", "method");
  if (amount > 1_000_000_000_000n) throw err.validation("Test top-ups are limited to $1,000,000.", "amountMicros");
  return created({ topup: opTopup(s, b, amount, now, false) });
});

route("GET", "/v1/topups", ({ s, principal, query }) => paginate(newestFirst(asBusiness(s, principal()).topups), query));

route("POST", "/v1/allocations", ({ s, principal, body, now }) => {
  const b = asBusiness(s, principal());
  const o = obj(body);
  const walletId = str(o.walletId, "walletId");
  const agentId = s.wallets.get(walletId);
  const a = agentId ? s.agents.get(agentId) : undefined;
  if (!a || a.businessId !== b.id) throw err.notFound("Wallet");
  const amount = microsField(o.amountMicros, "amountMicros");
  if (o.direction !== "to_wallet" && o.direction !== "to_unallocated") {
    throw err.validation("direction must be to_wallet or to_unallocated.", "direction");
  }
  opAllocate(s, b, a, amount, o.direction, now);
  return { unallocatedMicros: m(b.unallocated), wallet: walletOf(a) };
});

route("GET", "/v1/transactions", ({ s, principal, query }) => {
  const b = asBusiness(s, principal());
  const walletId = query.get("walletId");
  const list = newestFirst(walletId ? b.transactions.filter((t) => t.walletId === walletId) : b.transactions);
  return paginate(list, query);
});

route("GET", "/v1/agents/:id/rules", ({ s, principal, params }) => ({
  rules: agentOfBusiness(s, asBusiness(s, principal()), params.id!).rules,
}));

route("PUT", "/v1/agents/:id/rules", ({ s, principal, params, body }) => {
  const a = agentOfBusiness(s, asBusiness(s, principal()), params.id!);
  const o = obj(body);
  const opt = (v: unknown, f: string) => (v === null || v === undefined ? null : m(microsField(v, f)));
  let allowed: string[] | null = null;
  if (o.allowedSellerIds !== null && o.allowedSellerIds !== undefined) {
    if (!Array.isArray(o.allowedSellerIds) || o.allowedSellerIds.some((x) => typeof x !== "string")) {
      throw err.validation("allowedSellerIds must be a list of seller IDs or null.", "allowedSellerIds");
    }
    for (const id of o.allowedSellerIds as string[]) if (!s.sellers.has(id)) throw err.validation(`Unknown seller ${id}.`, "allowedSellerIds");
    allowed = o.allowedSellerIds as string[];
  }
  a.rules = {
    perPaymentMaxMicros: opt(o.perPaymentMaxMicros, "perPaymentMaxMicros"),
    dailyMaxMicros: opt(o.dailyMaxMicros, "dailyMaxMicros"),
    allowedSellerIds: allowed,
  };
  return { rules: a.rules };
});

route("GET", "/v1/mandates", ({ s, principal, query }) => {
  const b = asBusiness(s, principal());
  const list = [...s.mandates.values()].filter((x) => s.agents.get(x.agentId)?.businessId === b.id).map(({ token: _t, ...rest }) => rest);
  return paginate(newestFirst(list), query);
});

route("DELETE", "/v1/mandates/:id", ({ s, principal, params }) => {
  const b = asBusiness(s, principal());
  const md = s.mandates.get(params.id!);
  if (!md || s.agents.get(md.agentId)?.businessId !== b.id) throw err.notFound("Mandate");
  md.status = "revoked";
  const { token: _t, ...rest } = md;
  return { mandate: rest };
});

route("POST", "/v1/withdrawals", ({ s, principal, body, now }) => {
  const b = asBusiness(s, principal());
  const amount = microsField(obj(body).amountMicros, "amountMicros");
  if (b.unallocated < amount) throw err.funds("Not enough unallocated balance to withdraw that amount.");
  b.unallocated -= amount;
  const w: Withdrawal = { id: newId(s, "wdr"), amountMicros: m(amount), status: "sent", txHash: `0x${hex(s, 64)}`, createdAt: iso(now) };
  b.withdrawals.push(w);
  addTx(b, s, { type: "withdrawal", walletId: null, amountMicros: m(-amount), counterparty: null, createdAt: iso(now) });
  return created({ withdrawal: w });
});

route("GET", "/v1/withdrawals", ({ s, principal, query }) => paginate(newestFirst(asBusiness(s, principal()).withdrawals), query));

route("GET", "/v1/policy-hook", ({ s, principal }) => ({ url: asBusiness(s, principal()).policyHook?.url ?? null }));

route("PUT", "/v1/policy-hook", ({ s, principal, body }) => {
  const b = asBusiness(s, principal());
  const url = urlField(obj(body).url, "url");
  b.policyHook = { url, secret: `whsec_${randChars(s, 32)}` };
  return { url, secret: b.policyHook.secret };
});

route("DELETE", "/v1/policy-hook", ({ s, principal }) => {
  asBusiness(s, principal()).policyHook = null;
  return { ok: true };
});

/* ---- Agent ---- */

route("GET", "/v1/wallet", ({ s, principal }) => ({ wallet: walletOf(asAgent(s, principal())) }));

route("POST", "/v1/credentials", ({ s, principal, body, now }) => {
  const a = asAgent(s, principal());
  const o = obj(body);
  const sellerId = str(o.sellerId, "sellerId");
  const max = microsField(o.maxMicros, "maxMicros");
  const ttl = o.ttlSeconds === undefined ? 300 : o.ttlSeconds;
  if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 10 || ttl > 86400) {
    throw err.validation("ttlSeconds must be a whole number from 10 to 86400.", "ttlSeconds");
  }
  return created({ credential: credOut(opCreateCredential(s, a, sellerId, max, ttl, now), true) });
});

route("POST", "/v1/credentials/:id/release", ({ s, principal, params, now }) => {
  const a = asAgent(s, principal());
  const c = s.credentials.get(params.id!);
  if (!c || c.agentId !== a.agent.id) throw err.notFound("Credential");
  if (c.status === "active") releaseHold(s, c, "released", now);
  return { credential: credOut(c) };
});

route("GET", "/v1/payments", ({ s, principal, query }) => {
  const a = asAgent(s, principal());
  return paginate(newestFirst(s.charges.filter((c) => c.agentId === a.agent.id)), query);
});

route("POST", "/v1/mandates", ({ s, principal, body, now }) => {
  const a = asAgent(s, principal());
  if (a.agent.status !== "active") throw err.forbidden("This agent is disabled.");
  const o = obj(body);
  const sellerId = str(o.sellerId, "sellerId");
  if (!s.sellers.has(sellerId)) throw err.notFound("Seller");
  const max = microsField(o.maxPerPeriodMicros, "maxPerPeriodMicros");
  if (o.period !== "day" && o.period !== "week" && o.period !== "month") throw err.validation("period must be day, week or month.", "period");
  checkCreateRules(a, sellerId, max);
  const id = newId(s, "mdt");
  const md: Mandate = {
    id,
    walletId: a.agent.walletId,
    agentId: a.agent.id,
    sellerId,
    maxPerPeriodMicros: m(max),
    period: o.period,
    status: "active",
    createdAt: iso(now),
    token: placeholderToken("mandate", { sub: a.agent.id, aud: sellerId, jti: id, maxPerPeriod: m(max), period: o.period }),
  };
  s.mandates.set(id, md);
  return created({ mandate: md });
});

function pushCharge(
  s: Store,
  a: AgentRec,
  seller: SellerRec,
  amount: bigint,
  at: number,
  extra: { mandateId: string | null; description: string | null },
): Charge {
  if (a.available < amount) throw err.funds("Wallet balance is too low for this payment.");
  checkDailyRule(s, a, amount, at);
  const b = s.businesses.get(a.businessId)!;
  const f = fee(amount);
  a.available -= amount;
  seller.owed += amount - f;
  const charge: Charge = {
    id: newId(s, "chg"),
    credentialId: null,
    mandateId: extra.mandateId,
    sellerId: seller.id,
    agentId: a.agent.id,
    amountMicros: m(amount),
    feeMicros: m(f),
    refundedMicros: "0",
    description: extra.description,
    createdAt: iso(at),
  };
  s.charges.push(charge);
  addTx(b, s, { type: "charge", walletId: a.agent.walletId, amountMicros: m(-amount), counterparty: seller.name, createdAt: iso(at) });
  return charge;
}

route(
  "POST",
  "/v1/transfers",
  ({ s, principal, body, now }) => {
    const a = asAgent(s, principal());
    if (a.agent.status !== "active") throw err.forbidden("This agent is disabled.");
    const o = obj(body);
    const sellerId = str(o.sellerId, "sellerId");
    const seller = s.sellers.get(sellerId);
    if (!seller) throw err.notFound("Seller");
    const amount = microsField(o.amountMicros, "amountMicros");
    checkCreateRules(a, sellerId, amount);
    const reference = o.reference === undefined || o.reference === null ? null : str(o.reference, "reference", { max: 200 });
    return created({ charge: pushCharge(s, a, seller, amount, now, { mandateId: null, description: reference }) });
  },
  { idempotent: true },
);

/* ---- Seller ---- */

route(
  "POST",
  "/v1/charges",
  ({ s, principal, body, now }) => {
    const seller = asSeller(s, principal());
    const o = obj(body);
    const credentialId = str(o.credentialId, "credentialId");
    const amount = microsField(o.amountMicros, "amountMicros");
    if (o.final !== undefined && typeof o.final !== "boolean") throw err.validation("final must be true or false.", "final");
    const description = o.description === undefined || o.description === null ? null : str(o.description, "description", { max: 500 });
    return created(opCharge(s, seller, { credentialId, amount, final: o.final === true, description }, now));
  },
  { idempotent: true },
);

route("GET", "/v1/charges", ({ s, principal, query }) => {
  const seller = asSeller(s, principal());
  return paginate(newestFirst(s.charges.filter((c) => c.sellerId === seller.id)), query);
});

route("GET", "/v1/credentials/:id", ({ s, principal, params }) => {
  const p = principal();
  const c = s.credentials.get(params.id!);
  if (!c) throw err.notFound("Credential");
  const allowed = (p.type === "seller" && p.sellerId === c.sellerId) || (p.type === "agent" && p.agentId === c.agentId);
  if (!allowed) throw err.notFound("Credential");
  return { credential: credOut(c) };
});

route("GET", "/v1/payouts", ({ s, principal, query }) => {
  const seller = asSeller(s, principal());
  return paginate(newestFirst(s.payouts.filter((p) => p.sellerId === seller.id)), query);
});

route("GET", "/v1/seller/balance", ({ s, principal }) => {
  const seller = asSeller(s, principal());
  return { owedMicros: m(seller.owed), paidOutMicros: m(seller.paidOut) };
});

route("POST", "/v1/services", ({ s, principal, body }) => {
  const seller = asSeller(s, principal());
  const o = obj(body);
  const svc: Service = {
    id: newId(s, "svc"),
    sellerId: seller.id,
    name: str(o.name, "name", { max: 80 }),
    description: str(o.description, "description", { min: 0, max: 500 }),
    priceNote: str(o.priceNote, "priceNote", { min: 0, max: 80 }),
    url: urlField(o.url, "url"),
    active: true,
  };
  seller.services.push(svc);
  return created({ service: svc });
});

route("GET", "/v1/services", ({ s, principal, query }) => paginate([...asSeller(s, principal()).services].reverse(), query));

route("PATCH", "/v1/services/:id", ({ s, principal, params, body }) => {
  const seller = asSeller(s, principal());
  const svc = seller.services.find((x) => x.id === params.id);
  if (!svc) throw err.notFound("Service");
  const o = obj(body);
  if (o.name !== undefined) svc.name = str(o.name, "name", { max: 80 });
  if (o.description !== undefined) svc.description = str(o.description, "description", { min: 0, max: 500 });
  if (o.priceNote !== undefined) svc.priceNote = str(o.priceNote, "priceNote", { min: 0, max: 80 });
  if (o.url !== undefined) svc.url = urlField(o.url, "url");
  if (o.active !== undefined) {
    if (typeof o.active !== "boolean") throw err.validation("active must be true or false.", "active");
    svc.active = o.active;
  }
  return { service: svc };
});

route("GET", "/v1/payout-address", ({ s, principal }) => ({ address: asSeller(s, principal()).payoutAddress }));

route("PUT", "/v1/payout-address", ({ s, principal, body }) => {
  const seller = asSeller(s, principal());
  const address = str(obj(body).address, "address");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw err.validation("Address must be 0x followed by 40 hex characters.", "address");
  seller.payoutAddress = address;
  return { address };
});

route(
  "POST",
  "/v1/mandate-charges",
  ({ s, principal, body, now }) => {
    const seller = asSeller(s, principal());
    const o = obj(body);
    const md = s.mandates.get(str(o.mandateId, "mandateId"));
    if (!md || md.sellerId !== seller.id) throw err.notFound("Mandate");
    if (md.status !== "active") throw new HttpError(409, "credential_not_active", "This mandate is revoked.");
    const amount = microsField(o.amountMicros, "amountMicros");
    const a = s.agents.get(md.agentId)!;
    const periodMs = md.period === "day" ? DAY : md.period === "week" ? 7 * DAY : 30 * DAY;
    const since = now - periodMs;
    let used = 0n;
    for (const c of s.charges) if (c.mandateId === md.id && Date.parse(c.createdAt) >= since) used += BigInt(c.amountMicros);
    if (used + amount > BigInt(md.maxPerPeriodMicros)) {
      throw new HttpError(403, "rule_violation", "This charge would pass the mandate's limit for the period.", {
        outcome: "block",
        approvalLink: null,
      });
    }
    const description = o.description === undefined || o.description === null ? null : str(o.description, "description", { max: 500 });
    return created({ charge: pushCharge(s, a, seller, amount, now, { mandateId: md.id, description }) });
  },
  { idempotent: true },
);

route(
  "POST",
  "/v1/refunds",
  ({ s, principal, body, now }) => {
    const seller = asSeller(s, principal());
    const o = obj(body);
    const charge = s.charges.find((c) => c.id === o.chargeId && c.sellerId === seller.id);
    if (!charge) throw err.notFound("Charge");
    const refundable = BigInt(charge.amountMicros) - BigInt(charge.refundedMicros);
    const amount = o.amountMicros === undefined ? refundable : microsField(o.amountMicros, "amountMicros");
    if (amount === 0n || amount > refundable) throw err.validation("Refund is larger than what is left to refund.", "amountMicros");
    if (seller.owed < amount) {
      throw new HttpError(409, "insufficient_seller_balance", "Unsettled balance is smaller than the refund.");
    }
    seller.owed -= amount;
    charge.refundedMicros = m(BigInt(charge.refundedMicros) + amount);
    const a = s.agents.get(charge.agentId);
    if (a) {
      a.available += amount;
      const b = s.businesses.get(a.businessId);
      if (b) addTx(b, s, { type: "refund", walletId: a.agent.walletId, amountMicros: m(amount), counterparty: seller.name, createdAt: iso(now) });
    }
    const refund: Refund = { id: newId(s, "rfd"), chargeId: charge.id, amountMicros: m(amount), createdAt: iso(now) };
    s.refunds.push(refund);
    return created({ refund });
  },
  { idempotent: true },
);

route("PUT", "/v1/webhook", ({ s, principal, body }) => {
  const seller = asSeller(s, principal());
  const url = urlField(obj(body).url, "url");
  seller.webhook = { url, secret: `whsec_${randChars(s, 32)}` };
  return { url, secret: seller.webhook.secret };
});
