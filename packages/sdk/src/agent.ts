// Agent side of the SDK: pay sellers that answer HTTP 402 with a Gaitway body (context.md section 7).
import { randomUUID } from "node:crypto";
import { GaitwayError, HttpClient } from "./http.js";
import type { Charge, Credential, Page, PaymentRequiredBody, Wallet } from "./types.js";

export type GaitwayAgentOptions = {
  apiKey: string;
  baseUrl?: string;
  /** Size of each credential ("session") opened with a seller, in micros. Default "1000000" ($1). */
  sessionMicros?: string;
};

export type CreateCredentialInput = { sellerId: string; maxMicros: string; ttlSeconds?: number };

export type AgentFetchOptions = {
  /** Size of the credential to open if this call has to pay, instead of `sessionMicros`. */
  maxMicros?: string;
};

const TOKEN_HEADER = "gaitway-token";
const REQUEST_ID_HEADER = "gaitway-request-id";
const DIGITS = /^\d+$/;
/** Errors from `release` that mean the credential had already finished. */
const ALREADY_FINISHED = new Set(["credential_not_active", "credential_expired"]);

type Open = { id: string; token: string; expiresAtMs: number };

function positiveMicros(v: string, name: string): bigint {
  if (typeof v !== "string" || !DIGITS.test(v) || BigInt(v) <= 0n) {
    throw new TypeError(`${name} must be a positive whole number of micros as a string`);
  }
  return BigInt(v);
}

function isStreamBody(body: unknown): boolean {
  return (
    typeof body === "object" && body !== null &&
    (typeof (body as ReadableStream).getReader === "function" ||
      typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function")
  );
}

async function gaitwayChallenge(res: Response): Promise<PaymentRequiredBody["gaitway"] | null> {
  if (res.status !== 402) return null;
  try {
    const body = (await res.clone().json()) as Partial<PaymentRequiredBody> | null;
    const g = body?.gaitway;
    return g && typeof g === "object" && typeof g.sellerId === "string" && g.sellerId ? g : null;
  } catch {
    return null;
  }
}

export class GaitwayAgent {
  private readonly http: HttpClient;
  private readonly sessionMicros: bigint;
  /** Open credential per seller, used by `fetch`. */
  private readonly sessions = new Map<string, Open>();
  /** Which seller an origin answered for, so later calls attach the credential up front. */
  private readonly originSeller = new Map<string, string>();
  /** Every credential this instance created and has not seen finish; `releaseAll` releases these. */
  private readonly created = new Set<string>();
  /** In-flight session opens per seller, so concurrent calls share one credential. */
  private readonly opening = new Map<string, Promise<Open>>();

  constructor(opts: GaitwayAgentOptions) {
    this.http = new HttpClient({ apiKey: opts.apiKey, ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) });
    this.sessionMicros = positiveMicros(opts.sessionMicros ?? "1000000", "sessionMicros");
  }

  async balance(): Promise<Wallet> {
    return (await this.http.get<{ wallet: Wallet }>("/v1/wallet")).wallet;
  }

  async createCredential(input: CreateCredentialInput): Promise<Credential> {
    const { credential } = await this.http.post<{ credential: Credential }>("/v1/credentials", input);
    this.created.add(credential.id);
    return credential;
  }

  async release(credentialId: string): Promise<Credential> {
    this.forget(credentialId);
    const { credential } = await this.http.post<{ credential: Credential }>(
      `/v1/credentials/${encodeURIComponent(credentialId)}/release`,
    );
    return credential;
  }

  /** Releases every open credential this agent created. Ones that already finished are skipped. */
  async releaseAll(): Promise<void> {
    const ids = [...this.created];
    const results = await Promise.allSettled(ids.map((id) => this.release(id)));
    const failed = results.find(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && !(r.reason instanceof GaitwayError && ALREADY_FINISHED.has(r.reason.code)),
    );
    if (failed) throw failed.reason;
  }

  /** All of this agent's payments, newest first. */
  async payments(): Promise<Charge[]> {
    const out: Charge[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<Charge> = await this.http.get<Page<Charge>>("/v1/payments", { limit: 200, cursor: cursor ?? undefined });
      out.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }

  /**
   * `fetch` that pays. If the seller answers 402 with a Gaitway body, opens a credential for
   * that seller (`opts.maxMicros` or `sessionMicros`, capped to the available balance) and
   * retries exactly once. The credential is reused for later calls to the same seller.
   *
   * The request body must be re-sendable (string, bytes, FormData, URLSearchParams, Blob);
   * streams are not supported. Throws GaitwayError `payment_failed` if the paid retry is
   * also answered 402, and `insufficient_funds` if the wallet is empty.
   */
  async fetch(url: string, init: RequestInit = {}, opts: AgentFetchOptions = {}): Promise<Response> {
    if (isStreamBody(init.body)) {
      throw new TypeError("GaitwayAgent.fetch: stream bodies are not supported because the request may be re-sent");
    }
    const maxMicros = opts.maxMicros !== undefined ? positiveMicros(opts.maxMicros, "maxMicros") : this.sessionMicros;
    const origin = new URL(url).origin;
    const baseHeaders = new Headers(init.headers);
    if (!baseHeaders.has(REQUEST_ID_HEADER)) baseHeaders.set(REQUEST_ID_HEADER, randomUUID());

    const send = (token: string | undefined) => {
      const headers = new Headers(baseHeaders);
      if (token) headers.set(TOKEN_HEADER, token);
      else headers.delete(TOKEN_HEADER);
      return fetch(url, { ...init, headers });
    };

    const knownSeller = this.originSeller.get(origin);
    const cached = knownSeller ? this.usable(knownSeller) : undefined;
    const first = await send(cached?.token);
    const challenge = await gaitwayChallenge(first);
    if (!challenge) return first;

    const sellerId = challenge.sellerId;
    this.originSeller.set(origin, sellerId);
    if (cached) await this.dropSession(knownSeller!, cached.id); // exhausted, expired, or too small

    const session = await this.openSession(sellerId, maxMicros, cached?.id);
    await first.body?.cancel().catch(() => {});
    const second = await send(session.token);
    if (second.status === 402) {
      await second.body?.cancel().catch(() => {});
      await this.dropSession(sellerId, session.id);
      throw new GaitwayError("payment_failed", `Seller ${sellerId} refused payment after a credential was presented`, 402);
    }
    return second;
  }

  /** The cached session for a seller, if it has not expired by the local clock. */
  private usable(sellerId: string): Open | undefined {
    const s = this.sessions.get(sellerId);
    if (s && s.expiresAtMs - 2_000 <= Date.now()) {
      void this.dropSession(sellerId, s.id);
      return undefined;
    }
    return s;
  }

  /** Forget a session and release whatever is left of its hold, ignoring failures. */
  private async dropSession(sellerId: string, credentialId: string): Promise<void> {
    if (this.sessions.get(sellerId)?.id === credentialId) this.sessions.delete(sellerId);
    if (this.created.has(credentialId)) await this.release(credentialId).catch(() => {});
  }

  private forget(credentialId: string) {
    this.created.delete(credentialId);
    for (const [sellerId, s] of this.sessions) if (s.id === credentialId) this.sessions.delete(sellerId);
  }

  private openSession(sellerId: string, maxMicros: bigint, replacing?: string): Promise<Open> {
    // Share a concurrent open, unless it is for the credential we just found unusable.
    const current = this.sessions.get(sellerId);
    if (current && current.id !== replacing) return Promise.resolve(current);
    const pending = this.opening.get(sellerId);
    if (pending) return pending;

    const p = (async () => {
      const available = BigInt((await this.balance()).availableMicros);
      if (available <= 0n) throw new GaitwayError("insufficient_funds", "The wallet's available balance is zero", 402);
      const amount = maxMicros < available ? maxMicros : available;
      const c = await this.createCredential({ sellerId, maxMicros: amount.toString() });
      if (!c.token) throw new GaitwayError("http_error", "Gaitway did not return a credential token", 0);
      const open: Open = { id: c.id, token: c.token, expiresAtMs: Date.parse(c.expiresAt) };
      this.sessions.set(sellerId, open);
      return open;
    })();
    this.opening.set(sellerId, p);
    return p.finally(() => this.opening.delete(sellerId));
  }
}
