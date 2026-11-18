// Seller side of the SDK: verify credentials locally, charge them through the API.
import { createLocalJWKSet, decodeProtectedHeader, errors as joseErrors, jwtVerify, type JSONWebKeySet } from "jose";
import { DEFAULT_BASE_URL, GaitwayError, HttpClient } from "./http.js";
import type { Charge, Credential, Env, Mandate, PaymentRequiredBody, Refund } from "./types.js";

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

export type MandateClaims = {
  mandateId: string;
  agentId: string;
  agentName: string;
  business: { id: string; name: string; email: string; verified: boolean };
  maxPerPeriodMicros: string;
  period: Mandate["period"];
  expiresAt: Date;
  env: "test" | "live";
};

export type ChargeMandateInput = {
  mandateId: string;
  amountMicros: string;
  description?: string;
  idempotencyKey?: string;
};

export type RefundInput = { chargeId: string; amountMicros?: string; idempotencyKey?: string };

const CREDENTIAL_TYP = "gaitway-credential+jwt";
const MANDATE_TYP = "gaitway-mandate+jwt";
const PERIODS = new Set(["day", "week", "month"]);
const DIGITS = /^\d+$/;
/** Cached keys are refreshed after this long, even if nothing went wrong. */
const JWKS_MAX_AGE_MS = 10 * 60_000;
/** At most one refetch for an unknown `kid` per this window. */
const JWKS_UNKNOWN_KID_COOLDOWN_MS = 30_000;

const invalid = (message: string) => new GaitwayError("invalid_credential", message, 401);
const invalidMandate = (message: string) => new GaitwayError("invalid_mandate", message, 401);

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
    return mapClaims(await this.verifyJwt(token, CREDENTIAL_TYP, "Credential", invalid));
  }

  /**
   * Check a mandate (the `gaitway-mandate` header) locally, like `verify`: ES256 signature,
   * `typ: "gaitway-mandate+jwt"`, audience (this seller) and expiry. Any rejection throws
   * GaitwayError `invalid_mandate`. It does not tell you whether the mandate was revoked;
   * `chargeMandate` does.
   */
  async verifyMandate(token: string): Promise<MandateClaims> {
    return mapMandateClaims(await this.verifyJwt(token, MANDATE_TYP, "Mandate", invalidMandate));
  }

  private async verifyJwt(
    token: string, typ: string, what: string, fail: (m: string) => GaitwayError,
  ): Promise<Record<string, unknown>> {
    if (typeof token !== "string" || !token) throw fail(`No ${what.toLowerCase()} was presented`);
    let kid: unknown;
    let alg: unknown;
    try {
      ({ kid, alg } = decodeProtectedHeader(token));
    } catch {
      throw fail(`${what} is not a valid JWT`);
    }
    if (alg !== "ES256") throw fail(`${what} must be signed with ES256`);
    if (!isStr(kid)) throw fail(`${what} has no key id`);

    const keySet = await this.jwks.forKid(kid);
    try {
      const { payload } = await jwtVerify(token, createLocalJWKSet(keySet), {
        algorithms: ["ES256"],
        typ,
        audience: this.sellerId,
        requiredClaims: ["exp", "sub", "jti"],
      });
      return payload;
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw fail(`${what} has expired`);
      if (err instanceof joseErrors.JWTClaimValidationFailed && err.claim === "aud") {
        throw fail(`${what} is for a different seller`);
      }
      if (err instanceof joseErrors.JWKSNoMatchingKey) throw fail(`${what} is signed by an unknown key`);
      throw fail(`${what} rejected: ${(err as Error).message}`);
    }
  }

  /**
   * Charge a mandate. The money comes straight from the agent's available balance.
   * Without `idempotencyKey` a fresh one is generated per call.
   */
  async chargeMandate(input: ChargeMandateInput): Promise<Charge> {
    if (!isStr(input?.mandateId)) throw new GaitwayError("validation_failed", "chargeMandate: mandateId is required");
    if (typeof input.amountMicros !== "string" || !DIGITS.test(input.amountMicros)) {
      throw new GaitwayError("validation_failed", "chargeMandate: amountMicros must be a string of digits");
    }
    const body: Record<string, unknown> = { mandateId: input.mandateId, amountMicros: input.amountMicros };
    if (input.description !== undefined) body.description = input.description;
    const idempotencyKey = input.idempotencyKey || globalThis.crypto.randomUUID();
    const r = await this.http.post<{ charge: Charge }>("/v1/mandate-charges", body, { "idempotency-key": idempotencyKey });
    return r.charge;
  }

  /**
   * Refund a charge, in full (the default: whatever is not yet refunded) or in part.
   * Without `idempotencyKey` a fresh one is generated per call.
   */
  async refund(input: RefundInput): Promise<Refund> {
    if (!isStr(input?.chargeId)) throw new GaitwayError("validation_failed", "refund: chargeId is required");
    const body: Record<string, unknown> = { chargeId: input.chargeId };
    if (input.amountMicros !== undefined) {
      if (typeof input.amountMicros !== "string" || !DIGITS.test(input.amountMicros)) {
        throw new GaitwayError("validation_failed", "refund: amountMicros must be a string of digits");
      }
      body.amountMicros = input.amountMicros;
    }
    const idempotencyKey = input.idempotencyKey || globalThis.crypto.randomUUID();
    const r = await this.http.post<{ refund: Refund }>("/v1/refunds", body, { "idempotency-key": idempotencyKey });
    return r.refund;
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

type CommonClaims = Omit<CredentialClaims, "credentialId" | "maxMicros"> & { id: string };

/** Claims shared by credentials and mandates (context.md section 7). */
function mapCommon(p: Record<string, unknown>, what: string, fail: (m: string) => GaitwayError): CommonClaims {
  const { biz, agent } = p;
  if (!isStr(p.jti) || !isStr(p.sub) || typeof p.exp !== "number") throw fail(`${what} is missing claims`);
  if (p.env !== "test" && p.env !== "live") throw fail(`${what} has an invalid env`);
  if (p.cur !== "USD") throw fail(`${what} currency must be USD`);
  if (!isObj(biz) || !isStr(biz.id) || typeof biz.name !== "string" || typeof biz.email !== "string" ||
      typeof biz.verified !== "boolean") {
    throw fail(`${what} has an invalid business claim`);
  }
  if (!isObj(agent) || typeof agent.name !== "string") throw fail(`${what} has an invalid agent claim`);
  return {
    id: p.jti,
    agentId: p.sub,
    agentName: agent.name,
    business: { id: biz.id, name: biz.name, email: biz.email, verified: biz.verified },
    expiresAt: new Date(p.exp * 1000),
    env: p.env as Env,
  };
}

function mapClaims(p: Record<string, unknown>): CredentialClaims {
  const { id, ...rest } = mapCommon(p, "Credential", invalid);
  if (typeof p.max !== "string" || !DIGITS.test(p.max)) throw invalid("Credential has an invalid max");
  return { credentialId: id, agentId: rest.agentId, agentName: rest.agentName, business: rest.business,
    maxMicros: p.max, expiresAt: rest.expiresAt, env: rest.env };
}

function mapMandateClaims(p: Record<string, unknown>): MandateClaims {
  const { id, ...rest } = mapCommon(p, "Mandate", invalidMandate);
  if (typeof p.maxPerPeriod !== "string" || !DIGITS.test(p.maxPerPeriod)) {
    throw invalidMandate("Mandate has an invalid maxPerPeriod");
  }
  if (typeof p.period !== "string" || !PERIODS.has(p.period)) throw invalidMandate("Mandate has an invalid period");
  return { mandateId: id, agentId: rest.agentId, agentName: rest.agentName, business: rest.business,
    maxPerPeriodMicros: p.maxPerPeriod, period: p.period as Mandate["period"], expiresAt: rest.expiresAt, env: rest.env };
}
