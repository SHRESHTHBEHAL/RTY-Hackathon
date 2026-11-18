/**
 * The one typed client every screen uses. Server-side only: call it from
 * server components, server actions and route handlers, never from the
 * browser (the session token stays in an httpOnly cookie).
 *
 *   const gw = api(await getSessionToken());
 *   const { data } = await gw.listAgents();
 *
 * Mode: API_MODE=fixtures (default) answers from the in-memory fixture
 * backend; API_MODE=live calls NEXT_PUBLIC_API_BASE with a Bearer token.
 * Both throw GaitwayError on failure.
 */
import { GaitwayError } from "./errors";
import type {
  Account,
  Agent,
  ApiKey,
  Charge,
  Credential,
  Jwks,
  List,
  ListParams,
  Mandate,
  Payout,
  Refund,
  Rules,
  Seller,
  Service,
  Topup,
  Transaction,
  Wallet,
  Withdrawal,
} from "./types";

export type ApiMode = "fixtures" | "live";

export type ApiOptions = {
  mode?: ApiMode;
  /** Live mode base URL; defaults to NEXT_PUBLIC_API_BASE. */
  baseUrl?: string;
  /** Live mode request timeout in milliseconds. */
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export function apiMode(): ApiMode {
  return process.env.API_MODE === "live" ? "live" : "fixtures";
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type RequestOpts = { body?: unknown; idempotencyKey?: string; query?: Record<string, string | number | undefined | null> };

function buildQuery(q?: RequestOpts["query"]): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export function api(session?: string | null, options: ApiOptions = {}) {
  const mode = options.mode ?? apiMode();
  const baseUrl = (options.baseUrl ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787").replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request<T>(method: Method, path: string, opts: RequestOpts = {}): Promise<T> {
    const fullPath = path + buildQuery(opts.query);
    const headers: Record<string, string> = { accept: "application/json" };
    if (session) headers.authorization = `Bearer ${session}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

    let status: number;
    let body: unknown;
    if (mode === "fixtures") {
      const { fixtureFetch } = await import("./fixtures");
      const res = await fixtureFetch({ method, path: fullPath, body: opts.body, headers });
      status = res.status;
      // Round-trip through JSON so fixture objects are never shared by reference.
      body = res.body === undefined ? undefined : JSON.parse(JSON.stringify(res.body));
    } else {
      let res: Response;
      try {
        res = await doFetch(baseUrl + fullPath, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const name = (e as { name?: string } | null)?.name;
        if (name === "TimeoutError" || name === "AbortError") {
          throw new GaitwayError("timeout", "Gaitway did not answer in time.", 0);
        }
        throw new GaitwayError("network_error", "Cannot reach Gaitway.", 0);
      }
      status = res.status;
      const text = await res.text();
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        throw new GaitwayError("bad_response", `Gaitway sent a response that is not JSON (HTTP ${status}).`, status);
      }
    }
    if (status < 200 || status >= 300) throw GaitwayError.fromBody(status, body);
    return body as T;
  }

  const list = <T>(path: string, params?: ListParams & Record<string, string | number | undefined>) =>
    request<List<T>>("GET", path, { query: params });
  const id = (v: string) => encodeURIComponent(v);

  return {
    mode,

    /* ---- Public ---- */
    health: () => request<{ ok: true }>("GET", "/health"),
    getJwks: () => request<Jwks>("GET", "/.well-known/jwks.json"),
    createAccount: (input: { email: string; password: string; name: string; kind: "business" | "seller" }) =>
      request<{ account: Account; sessionToken: string; apiKey: string }>("POST", "/v1/accounts", { body: input }),
    createSession: (input: { email: string; password: string }) =>
      request<{ account: Account; sessionToken: string }>("POST", "/v1/sessions", { body: input }),
    /** M2 */
    listSellers: (params: ListParams & { query?: string } = {}) => list<Seller>("/v1/sellers", params),
    /** M2 */
    getSeller: (sellerId: string) => request<{ seller: Seller }>("GET", `/v1/sellers/${id(sellerId)}`),

    /* ---- Any session or key ---- */
    getMe: () => request<{ account: Account }>("GET", "/v1/me"),
    listKeys: (params?: ListParams) => list<ApiKey>("/v1/keys", params),
    createKey: (input: { label: string }) => request<{ key: ApiKey; apiKey: string }>("POST", "/v1/keys", { body: input }),
    deleteKey: (keyId: string) => request<{ ok: true }>("DELETE", `/v1/keys/${id(keyId)}`),

    /* ---- Business ---- */
    createAgent: (input: { name: string }) => request<{ agent: Agent; apiKey: string }>("POST", "/v1/agents", { body: input }),
    listAgents: (params?: ListParams) => list<Agent>("/v1/agents", params),
    getAgent: (agentId: string) => request<{ agent: Agent; wallet: Wallet }>("GET", `/v1/agents/${id(agentId)}`),
    updateAgent: (agentId: string, patch: { name?: string; status?: Agent["status"] }) =>
      request<{ agent: Agent }>("PATCH", `/v1/agents/${id(agentId)}`, { body: patch }),
    listAgentKeys: (agentId: string, params?: ListParams) => list<ApiKey>(`/v1/agents/${id(agentId)}/keys`, params),
    createAgentKey: (agentId: string, input: { label: string }) =>
      request<{ key: ApiKey; apiKey: string }>("POST", `/v1/agents/${id(agentId)}/keys`, { body: input }),
    deleteAgentKey: (agentId: string, keyId: string) =>
      request<{ ok: true }>("DELETE", `/v1/agents/${id(agentId)}/keys/${id(keyId)}`),
    getBalance: () => request<{ unallocatedMicros: string; wallets: Wallet[] }>("GET", "/v1/balance"),
    createTopup: (input: { amountMicros: string; method: Topup["method"] }) =>
      request<{ topup: Topup }>("POST", "/v1/topups", { body: input }),
    listTopups: (params?: ListParams) => list<Topup>("/v1/topups", params),
    allocate: (input: { walletId: string; amountMicros: string; direction: "to_wallet" | "to_unallocated" }) =>
      request<{ unallocatedMicros: string; wallet: Wallet }>("POST", "/v1/allocations", { body: input }),
    listTransactions: (params: ListParams & { walletId?: string } = {}) => list<Transaction>("/v1/transactions", params),
    /** M2 */
    getAgentRules: (agentId: string) => request<{ rules: Rules }>("GET", `/v1/agents/${id(agentId)}/rules`),
    /** M2 */
    setAgentRules: (agentId: string, rules: Rules) =>
      request<{ rules: Rules }>("PUT", `/v1/agents/${id(agentId)}/rules`, { body: rules }),
    /** M2 */
    listMandates: (params?: ListParams) => list<Mandate>("/v1/mandates", params),
    /** M2 */
    revokeMandate: (mandateId: string) => request<{ mandate: Mandate }>("DELETE", `/v1/mandates/${id(mandateId)}`),
    /** M2 */
    createWithdrawal: (input: { amountMicros: string }) =>
      request<{ withdrawal: Withdrawal }>("POST", "/v1/withdrawals", { body: input }),
    /** M2 */
    listWithdrawals: (params?: ListParams) => list<Withdrawal>("/v1/withdrawals", params),
    /** M2 */
    getPolicyHook: () => request<{ url: string | null }>("GET", "/v1/policy-hook"),
    /** M2 */
    setPolicyHook: (input: { url: string }) => request<{ url: string; secret: string }>("PUT", "/v1/policy-hook", { body: input }),
    /** M2 */
    deletePolicyHook: () => request<{ ok: true }>("DELETE", "/v1/policy-hook"),

    /* ---- Agent ---- */
    getWallet: () => request<{ wallet: Wallet }>("GET", "/v1/wallet"),
    createCredential: (input: { sellerId: string; maxMicros: string; ttlSeconds?: number }) =>
      request<{ credential: Credential }>("POST", "/v1/credentials", { body: input }),
    releaseCredential: (credentialId: string) =>
      request<{ credential: Credential }>("POST", `/v1/credentials/${id(credentialId)}/release`),
    listPayments: (params?: ListParams) => list<Charge>("/v1/payments", params),
    /** M2 */
    createMandate: (input: { sellerId: string; maxPerPeriodMicros: string; period: Mandate["period"] }) =>
      request<{ mandate: Mandate }>("POST", "/v1/mandates", { body: input }),
    /** M2. Sends an Idempotency-Key; pass one to make retries safe. */
    createTransfer: (input: { sellerId: string; amountMicros: string; reference?: string }, idempotencyKey = newIdempotencyKey()) =>
      request<{ charge: Charge }>("POST", "/v1/transfers", { body: input, idempotencyKey }),

    /* ---- Seller ---- */
    /** Sends an Idempotency-Key; pass one to make retries safe. */
    createCharge: (
      input: { credentialId: string; amountMicros: string; final?: boolean; description?: string },
      idempotencyKey = newIdempotencyKey(),
    ) => request<{ charge: Charge; remainingMicros: string }>("POST", "/v1/charges", { body: input, idempotencyKey }),
    listCharges: (params?: ListParams) => list<Charge>("/v1/charges", params),
    getCredential: (credentialId: string) => request<{ credential: Credential }>("GET", `/v1/credentials/${id(credentialId)}`),
    listPayouts: (params?: ListParams) => list<Payout>("/v1/payouts", params),
    getSellerBalance: () => request<{ owedMicros: string; paidOutMicros: string }>("GET", "/v1/seller/balance"),
    createService: (input: { name: string; description: string; priceNote: string; url: string }) =>
      request<{ service: Service }>("POST", "/v1/services", { body: input }),
    listServices: (params?: ListParams) => list<Service>("/v1/services", params),
    updateService: (serviceId: string, patch: Partial<Pick<Service, "name" | "description" | "priceNote" | "url" | "active">>) =>
      request<{ service: Service }>("PATCH", `/v1/services/${id(serviceId)}`, { body: patch }),
    getPayoutAddress: () => request<{ address: string }>("GET", "/v1/payout-address"),
    /** M2 */
    setPayoutAddress: (input: { address: string }) => request<{ address: string }>("PUT", "/v1/payout-address", { body: input }),
    /** M2 */
    createMandateCharge: (input: { mandateId: string; amountMicros: string; description?: string }, idempotencyKey = newIdempotencyKey()) =>
      request<{ charge: Charge }>("POST", "/v1/mandate-charges", { body: input, idempotencyKey }),
    /** M2 */
    createRefund: (input: { chargeId: string; amountMicros?: string }, idempotencyKey = newIdempotencyKey()) =>
      request<{ refund: Refund }>("POST", "/v1/refunds", { body: input, idempotencyKey }),
    /** M2 */
    setWebhook: (input: { url: string }) => request<{ url: string; secret: string }>("PUT", "/v1/webhook", { body: input }),
  };
}

export type GaitwayApi = ReturnType<typeof api>;
export { GaitwayError } from "./errors";
