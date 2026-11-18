import type { Db, Tx } from "./db/client.js";
import type { Env } from "./config.js";
import { balancesOf } from "./ledger/ledger.js";
import { iso } from "./http.js";

export type AccountRow = {
  id: string;
  env: Env;
  email: string;
  name: string;
  kind: "business" | "seller";
  business_id: string | null;
  seller_id: string | null;
};
export const accountJson = (a: AccountRow) => ({
  id: a.id,
  email: a.email,
  name: a.name,
  kind: a.kind,
  businessId: a.business_id,
  sellerId: a.seller_id,
});

export type AgentRow = {
  id: string;
  seq: bigint;
  env: Env;
  business_id: string;
  name: string;
  status: "active" | "disabled";
  wallet_id: string;
  created_at: Date;
};
export const agentJson = (a: AgentRow) => ({
  id: a.id,
  name: a.name,
  walletId: a.wallet_id,
  status: a.status,
  createdAt: iso(a.created_at),
});

export type WalletJson = { walletId: string; agentId: string; availableMicros: string; heldMicros: string };

/** Wallet objects with live balances for the given (walletId, agentId) pairs, in order. */
export async function walletsJson(db: Db | Tx, env: Env, wallets: { walletId: string; agentId: string }[]): Promise<WalletJson[]> {
  const ids = wallets.map((w) => w.walletId);
  const [avail, held] = await Promise.all([balancesOf(db, env, "available", ids), balancesOf(db, env, "held", ids)]);
  return wallets.map((w) => ({
    walletId: w.walletId,
    agentId: w.agentId,
    availableMicros: (avail.get(w.walletId) ?? 0n).toString(),
    heldMicros: (held.get(w.walletId) ?? 0n).toString(),
  }));
}

export async function walletJson(db: Db | Tx, env: Env, walletId: string, agentId: string): Promise<WalletJson> {
  return (await walletsJson(db, env, [{ walletId, agentId }]))[0]!;
}
