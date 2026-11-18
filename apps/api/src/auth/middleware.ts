import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { hashKey, type KeyRow } from "./keys.js";
import type { Principal, PrincipalKind } from "./principal.js";
import { verifySessionToken } from "./sessions.js";

/** Resolves the bearer token to a principal, or throws unauthorized. */
export async function authenticate(deps: Deps, header: string | undefined): Promise<Principal> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!m) throw new ApiError("unauthorized");
  const token = m[1]!;
  const { sql } = deps;

  if (token.startsWith("gws_")) {
    const accountId = verifySessionToken(token, deps.config.sessionSecret, deps.now());
    if (!accountId) throw new ApiError("unauthorized", "Invalid or expired session");
    const [acc] = await sql<{ id: string; env: "test" | "live"; kind: "business" | "seller"; business_id: string | null; seller_id: string | null }[]>`
      select id, env, kind, business_id, seller_id from accounts where id = ${accountId}`;
    if (!acc) throw new ApiError("unauthorized", "Invalid or expired session");
    return {
      env: acc.env,
      kind: acc.kind,
      accountId: acc.id,
      businessId: acc.business_id ?? undefined,
      sellerId: acc.seller_id ?? undefined,
      via: "session",
    };
  }

  if (/^gw_(test|live)_(biz|sel|agt)_[0-9a-z]{32}$/.test(token)) {
    const [k] = await sql<KeyRow[]>`select * from api_keys where key_hash = ${hashKey(token)} and revoked_at is null`;
    if (!k) throw new ApiError("unauthorized", "Unknown or revoked API key");
    if (k.holder_kind === "agent") {
      const [a] = await sql<{ id: string; wallet_id: string; business_id: string }[]>`
        select id, wallet_id, business_id from agents where id = ${k.agent_id}`;
      if (!a) throw new ApiError("unauthorized");
      return { env: k.env, kind: "agent", agentId: a.id, walletId: a.wallet_id, businessId: a.business_id, via: "key", keyId: k.id };
    }
    const ownerCol = k.holder_kind === "business" ? k.business_id : k.seller_id;
    const [acc] = await sql<{ id: string }[]>`
      select id from accounts where ${k.holder_kind === "business" ? sql`business_id` : sql`seller_id`} = ${ownerCol}`;
    return {
      env: k.env,
      kind: k.holder_kind,
      accountId: acc?.id,
      businessId: k.business_id ?? undefined,
      sellerId: k.seller_id ?? undefined,
      via: "key",
      keyId: k.id,
    };
  }
  throw new ApiError("unauthorized", "Unrecognised API key or session token");
}

/** Requires a principal of one of the given kinds; sets c.var.principal. */
export function requireAuth(deps: Deps, kinds: PrincipalKind[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const p = await authenticate(deps, c.req.header("authorization"));
    if (!kinds.includes(p.kind)) {
      throw new ApiError("forbidden", `This route needs a ${kinds.join(" or ")} key or session`);
    }
    c.set("principal", p);
    await next();
  };
}
