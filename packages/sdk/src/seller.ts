// Seller side of the SDK: verify credentials locally, charge them through the API.
import { createLocalJWKSet, decodeProtectedHeader, errors as joseErrors, jwtVerify, type JSONWebKeySet } from "jose";
import { DEFAULT_BASE_URL, GaitwayError, HttpClient } from "./http.js";
import type { Charge, Credential, Env, PaymentRequiredBody } from "./types.js";

export type CredentialClaims = {
  credentialId: string;
  agentId: string;
  agentName: string;
  business: { id: string; name: string; email: string; verified: boolean };
  maxMicros: string;
  expiresAt: Date;
  env: "test" | "live";
};

export type GaitwaySellerOptions = { apiKey: string; sellerId: string; baseUrl?: string };

export type ChargeInput = {
  credentialId: string;
  amountMicros: string;
  final?: boolean;
  description?: string;
  idempotencyKey?: string;
};

export type ChargeResult = { charge: Charge; remainingMicros: string };

export type PaymentRequired = { status: 402; body: PaymentRequiredBody };

const CREDENTIAL_TYP = "gaitway-credential+jwt";
const DIGITS = /^\d+$/;
/** Cached keys are refreshed after this long, even if nothing went wrong. */
const JWKS_MAX_AGE_MS = 10 * 60_000;
/** At most one refetch for an unknown `kid` per this window. */
const JWKS_UNKNOWN_KID_COOLDOWN_MS = 30_000;

const invalid = (message: string) => new GaitwayError("invalid_credential", message, 401);

/**
 * Fetches `{baseUrl}/.well-known/jwks.json` once and caches it. Concurrent loads share
 * one request. A token with an unknown `kid` triggers one refetch, then a cooldown.
 */
class JwksCache {
  private keys: JSONWebKeySet | null = null;
  private kids = new Set<string>();
  private loadedAt = 0;
  private lastUnknownKidRefetchAt = -Infinity;
  private inflight: Promise<void> | null = null;

  constructor(private readonly url: string) {}

  /** Returns a key set that contains `kid` if one can be found. */
  async forKid(kid: string): Promise<JSONWebKeySet> {
    if (!this.keys || Date.now() - this.loadedAt > JWKS_MAX_AGE_MS) await this.load();
    if (!this.kids.has(kid) && Date.now() - this.lastUnknownKidRefetchAt >= JWKS_UNKNOWN_KID_COOLDOWN_MS) {
      this.lastUnknownKidRefetchAt = Date.now();
      await this.load();
    }
    return this.keys!;
  }

  private load(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.fetchKeys().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchKeys(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new GaitwayError("network_error", `Could not fetch Gaitway public keys from ${this.url}: ${(err as Error).message}`, 0);
    }
    let body: unknown;
    try {
      body = res.ok ? await res.json() : undefined;
    } catch {
      body = undefined;
    }
    const keys = (body as { keys?: unknown } | undefined)?.keys;
    if (!res.ok || !Array.isArray(keys)) {
      throw new GaitwayError("http_error", `Unexpected response (${res.status}) fetching Gaitway public keys`, res.status);
    }
    this.keys = { keys } as JSONWebKeySet;
    this.kids = new Set(keys.map((k) => (k as { kid?: unknown }).kid).filter((k): k is string => typeof k === "string"));
    this.loadedAt = Date.now();
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export class GaitwaySeller {
  readonly sellerId: string;
  readonly baseUrl: string;
  private readonly http: HttpClient;
  private readonly jwks: JwksCache;

  constructor(opts: GaitwaySellerOptions) {
    if (!opts?.apiKey) throw new TypeError("GaitwaySeller: apiKey is required");
    if (!opts.sellerId) throw new TypeError("GaitwaySeller: sellerId is required");
    this.sellerId = opts.sellerId;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.http = new HttpClient({ apiKey: opts.apiKey, baseUrl: this.baseUrl });
    this.jwks = new JwksCache(`${this.baseUrl}/.well-known/jwks.json`);
  }

  /**
   * Check a credential locally: ES256 signature against Gaitway's cached public keys,
   * `typ`, audience (this seller) and expiry. Any rejection throws GaitwayError
   * `invalid_credential`. Failing to fetch the keys throws `network_error` or `http_error`.
   */
  async verify(token: string): Promise<CredentialClaims> {
    if (typeof token !== "string" || !token) throw invalid("No credential was presented");
    let kid: unknown;
    let alg: unknown;
    try {
      ({ kid, alg } = decodeProtectedHeader(token));
    } catch {
      throw invalid("Credential is not a valid JWT");
    }
    if (alg !== "ES256") throw invalid("Credential must be signed with ES256");
    if (!isStr(kid)) throw invalid("Credential has no key id");

    const keySet = await this.jwks.forKid(kid);
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, createLocalJWKSet(keySet), {
        algorithms: ["ES256"],
        typ: CREDENTIAL_TYP,
        audience: this.sellerId,
        requiredClaims: ["exp", "sub", "jti"],
      }));
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw invalid("Credential has expired");
      if (err instanceof joseErrors.JWTClaimValidationFailed && err.claim === "aud") {
        throw invalid("Credential is for a different seller");
      }
      if (err instanceof joseErrors.JWKSNoMatchingKey) throw invalid("Credential is signed by an unknown key");
      throw invalid(`Credential rejected: ${(err as Error).message}`);
    }
    return mapClaims(payload);
  }

  /** Charge a credential. Without `idempotencyKey` a fresh one is generated per call. */
  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!isStr(input?.credentialId)) throw new GaitwayError("validation_failed", "charge: credentialId is required");
    if (typeof input.amountMicros !== "string" || !DIGITS.test(input.amountMicros)) {
      throw new GaitwayError("validation_failed", "charge: amountMicros must be a string of digits");
    }
    const body: Record<string, unknown> = { credentialId: input.credentialId, amountMicros: input.amountMicros };
    if (input.final !== undefined) body.final = input.final;
    if (input.description !== undefined) body.description = input.description;
    const idempotencyKey = input.idempotencyKey || globalThis.crypto.randomUUID();
    return this.http.post<ChargeResult>("/v1/charges", body, { "idempotency-key": idempotencyKey });
  }

  async getCredential(id: string): Promise<Credential> {
    const r = await this.http.get<{ credential: Credential }>(`/v1/credentials/${encodeURIComponent(id)}`);
    return r.credential;
  }

  /** The HTTP 402 response to send when there is no valid credential (context.md section 7). */
  paymentRequired(price: { priceMicros?: string; priceNote?: string } = {}): PaymentRequired {
    return {
      status: 402,
      body: {
        error: { code: "payment_required", message: "Pay with Gaitway" },
        gaitway: {
          sellerId: this.sellerId,
          priceMicros: price.priceMicros ?? null,
          priceNote: price.priceNote ?? null,
          apiBase: this.baseUrl,
        },
      },
    };
  }
}

function mapClaims(p: Record<string, unknown>): CredentialClaims {
  const { biz, agent } = p;
  if (!isStr(p.jti) || !isStr(p.sub) || typeof p.exp !== "number") throw invalid("Credential is missing claims");
  if (p.env !== "test" && p.env !== "live") throw invalid("Credential has an invalid env");
  if (typeof p.max !== "string" || !DIGITS.test(p.max)) throw invalid("Credential has an invalid max");
  if (p.cur !== "USD") throw invalid("Credential currency must be USD");
  if (!isObj(biz) || !isStr(biz.id) || typeof biz.name !== "string" || typeof biz.email !== "string" ||
      typeof biz.verified !== "boolean") {
    throw invalid("Credential has an invalid business claim");
  }
  if (!isObj(agent) || typeof agent.name !== "string") throw invalid("Credential has an invalid agent claim");
  return {
    credentialId: p.jti,
    agentId: p.sub,
    agentName: agent.name,
    business: { id: biz.id, name: biz.name, email: biz.email, verified: biz.verified },
    maxMicros: p.max,
    expiresAt: new Date(p.exp * 1000),
    env: p.env as Env,
  };
}
