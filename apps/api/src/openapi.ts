import type { App } from "./app.js";
import type { Deps } from "./deps.js";

type Auth = "public" | "any" | "business" | "agent" | "seller";
// [method, path, auth, milestone, summary]
const ROUTES: [string, string, Auth, "M1" | "M2", string][] = [
  ["get", "/health", "public", "M1", "Liveness"],
  ["get", "/.well-known/jwks.json", "public", "M1", "Public keys for credential and mandate tokens"],
  ["post", "/v1/accounts", "public", "M1", "Sign up a business or seller"],
  ["post", "/v1/sessions", "public", "M1", "Log in"],
  ["get", "/v1/sellers", "public", "M2", "Seller directory search"],
  ["get", "/v1/sellers/{id}", "public", "M2", "One seller"],
  ["get", "/v1/openapi.json", "public", "M2", "This document"],
  ["get", "/v1/me", "any", "M1", "Calling account"],
  ["get", "/v1/keys", "any", "M1", "List API keys"],
  ["post", "/v1/keys", "any", "M1", "Create an API key"],
  ["delete", "/v1/keys/{id}", "any", "M1", "Revoke an API key"],
  ["post", "/v1/agents", "business", "M1", "Create an agent"],
  ["get", "/v1/agents", "business", "M1", "List agents"],
  ["get", "/v1/agents/{id}", "business", "M1", "Agent and wallet"],
  ["patch", "/v1/agents/{id}", "business", "M1", "Rename or disable an agent"],
  ["get", "/v1/agents/{id}/keys", "business", "M1", "List agent keys"],
  ["post", "/v1/agents/{id}/keys", "business", "M1", "Create an agent key"],
  ["delete", "/v1/agents/{id}/keys/{keyId}", "business", "M1", "Revoke an agent key"],
  ["get", "/v1/balance", "business", "M1", "Unallocated balance and wallets"],
  ["post", "/v1/topups", "business", "M1", "Top up"],
  ["get", "/v1/topups", "business", "M1", "List top-ups"],
  ["post", "/v1/allocations", "business", "M1", "Move money to or from a wallet"],
  ["get", "/v1/transactions", "business", "M1", "Ledger transactions"],
  ["get", "/v1/agents/{id}/rules", "business", "M2", "Spending rules"],
  ["put", "/v1/agents/{id}/rules", "business", "M2", "Set spending rules"],
  ["get", "/v1/mandates", "business", "M2", "List mandates"],
  ["delete", "/v1/mandates/{id}", "business", "M2", "Revoke a mandate"],
  ["post", "/v1/withdrawals", "business", "M2", "Withdraw unallocated funds"],
  ["get", "/v1/withdrawals", "business", "M2", "List withdrawals"],
  ["get", "/v1/policy-hook", "business", "M2", "Policy hook URL"],
  ["put", "/v1/policy-hook", "business", "M2", "Set policy hook"],
  ["delete", "/v1/policy-hook", "business", "M2", "Remove policy hook"],
  ["post", "/v1/verification", "business", "M2", "Run the identity provider (simulated)"],
  ["get", "/v1/wallet", "agent", "M1", "Own wallet"],
  ["post", "/v1/credentials", "agent", "M1", "Authorise: create a credential and hold"],
  ["post", "/v1/credentials/{id}/release", "agent", "M1", "Release a credential's hold"],
  ["get", "/v1/payments", "agent", "M1", "Own charges"],
  ["post", "/v1/mandates", "agent", "M2", "Create a mandate"],
  ["post", "/v1/transfers", "agent", "M2", "Push payment to a seller"],
  ["post", "/v1/charges", "seller", "M1", "Charge a credential"],
  ["get", "/v1/charges", "seller", "M1", "List charges"],
  ["get", "/v1/credentials/{id}", "seller", "M1", "Read a credential (seller or owning agent)"],
  ["get", "/v1/payouts", "seller", "M1", "List payouts"],
  ["get", "/v1/seller/balance", "seller", "M1", "Owed and paid-out balance"],
  ["post", "/v1/services", "seller", "M1", "Create a service"],
  ["get", "/v1/services", "seller", "M1", "List services"],
  ["patch", "/v1/services/{id}", "seller", "M1", "Update a service"],
  ["get", "/v1/payout-address", "seller", "M1", "Payout address"],
  ["put", "/v1/payout-address", "seller", "M2", "Change payout address"],
  ["post", "/v1/mandate-charges", "seller", "M2", "Charge a mandate"],
  ["post", "/v1/refunds", "seller", "M2", "Refund a charge"],
  ["put", "/v1/webhook", "seller", "M2", "Set webhook URL"],
];

export function openApiDocument(issuer: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, auth, milestone, summary] of ROUTES) {
    paths[path] ??= {};
    paths[path][method] = {
      summary,
      tags: [auth],
      "x-milestone": milestone,
      ...(auth === "public" ? { security: [] } : {}),
      ...(["/v1/charges", "/v1/mandate-charges", "/v1/transfers", "/v1/refunds"].includes(path) && method === "post"
        ? { parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }] }
        : {}),
      responses: { "200": { description: "OK" }, default: { description: "Error: { error: { code, message, details? } }" } },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Gaitway API", version: "0.2.0", description: "Contract: context.md section 8. Amounts are micros as digit strings." },
    servers: [{ url: issuer }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    security: [{ bearer: [] }],
    paths,
  };
}

export function registerOpenApi(app: App, deps: Deps) {
  app.get("/v1/openapi.json", (c) => c.json(openApiDocument(deps.config.issuer)));
}
