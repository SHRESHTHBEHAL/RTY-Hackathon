import type { Env } from "../config.js";

export type PrincipalKind = "business" | "seller" | "agent";

export type Principal = {
  env: Env;
  kind: PrincipalKind;
  /** Set when authenticated by session token, or by a business/seller key (the owning account). */
  accountId?: string;
  businessId?: string;
  sellerId?: string;
  agentId?: string;
  walletId?: string;
  /** "session" or "key" */
  via: "session" | "key";
  keyId?: string;
};
