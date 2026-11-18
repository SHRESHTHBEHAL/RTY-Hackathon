// In-memory mock of the Gaitway API (context.md section 8) for SDK tests and local work.
// Implements only the routes the SDK needs. Uses node:http, no framework.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose";
import type { Charge, Credential, Wallet } from "../types.js";

export type MockBusiness = { id: string; name: string; email: string; apiKey: string };
export type MockAgent = { id: string; name: string; businessId: string; walletId: string; apiKey: string };
export type MockSeller = { id: string; name: string; apiKey: string };

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
}

type Role = "biz" | "agt" | "sel";
type CredRec = Credential & { env: "test"; held: bigint; remaining: bigint; max: bigint; expMs: number };
type WalletRec = { walletId: string; agentId: string; available: bigint; held: bigint };
type StoredResponse = { status: number; body: unknown; fingerprint: string };

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
  const charges: Charge[] = [];
  const idem = new Map<string, StoredResponse>();

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
      const agent = agents.get(agentId)!;
      if (agent.status === "disabled") throw new ApiError(403, "forbidden", "This agent is disabled");
      const seller = sellers.get(sellerId);
      if (!seller) throw new ApiError(404, "not_found", "Seller not found");
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
      const w = wallets.get(c.agentId)!;
      const fee = (amount * feeBps) / 10000n;
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
      const charge: Charge = {
        id: newId("chg"), credentialId: c.id, mandateId: null, sellerId, agentId: c.agentId,
        amountMicros: amount.toString(), feeMicros: fee.toString(), refundedMicros: "0",
        description: (body.description as string | null | undefined) ?? null,
        createdAt: new Date(now()).toISOString(),
      };
      charges.push(charge);
      const resp = { charge, remainingMicros: c.remaining.toString() };
      idem.set(ik, { status: 200, body: resp, fingerprint });
      return send(res, 200, resp);
    }

    if (method === "GET" && path === "/v1/payments") {
      const agentId = auth(req, "agt");
      return send(res, 200, paginate(charges.filter((c) => c.agentId === agentId), url));
    }
    if (method === "GET" && path === "/v1/charges") {
      const sellerId = auth(req, "sel");
      return send(res, 200, paginate(charges.filter((c) => c.sellerId === sellerId), url));
    }
    if (method === "GET" && path === "/v1/seller/balance") {
      const s = sellers.get(auth(req, "sel"))!;
      return send(res, 200, { owedMicros: s.owed.toString(), paidOutMicros: s.paidOut.toString() });
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
  };
}
