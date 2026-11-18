import type { Env } from "../config.js";
import type { Deps } from "../deps.js";
import type { Tx } from "../db/client.js";
import { ApiError } from "../errors.js";
import { iso } from "../http.js";
import { newId } from "../ids.js";
import { post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { signToken } from "./signer.js";
import { checkRules } from "../rules/check.js";

export type CredentialRow = {
  id: string;
  seq: bigint;
  env: Env;
  agent_id: string;
  wallet_id: string;
  business_id: string;
  seller_id: string;
  max_micros: bigint;
  remaining_micros: bigint;
  status: "active" | "released" | "expired" | "exhausted";
  expires_at: Date;
  created_at: Date;
};

export function credentialJson(r: CredentialRow, now: Date, token?: string) {
  // An active credential past its expiry is reported as expired; the sweeper releases its hold within seconds.
  const status = r.status === "active" && r.expires_at.getTime() <= now.getTime() ? "expired" : r.status;
  const out: Record<string, unknown> = {
    id: r.id,
    sellerId: r.seller_id,
    agentId: r.agent_id,
    businessId: r.business_id,
    maxMicros: r.max_micros.toString(),
    remainingMicros: r.remaining_micros.toString(),
    status,
    expiresAt: iso(r.expires_at),
  };
  if (token !== undefined) out.token = token;
  return out;
}

export async function createCredential(
  deps: Deps,
  agent: { env: Env; agentId: string; walletId: string; businessId: string },
  input: { sellerId: string; maxMicros: bigint; ttlSeconds: number },
) {
  const { sql } = deps;
  const [a] = await sql<{ id: string; name: string; status: string }[]>`select id, name, status from agents where id = ${agent.agentId}`;
  if (!a) throw new ApiError("not_found");
  if (a.status !== "active") throw new ApiError("forbidden", "This agent is disabled");
  const [seller] = await sql`select id from sellers where id = ${input.sellerId} and env = ${agent.env}`;
  if (!seller) throw new ApiError("not_found", "No such seller");
  const [biz] = await sql<{ id: string; name: string; verified: boolean; email: string }[]>`
    select b.id, b.name, b.verified, a.email from businesses b join accounts a on a.id = b.account_id where b.id = ${agent.businessId}`;
  if (!biz) throw new ApiError("not_found");
  await checkRules(sql, { agentId: agent.agentId, sellerId: input.sellerId, amountMicros: input.maxMicros, at: "authorise", now: deps.now() });
  await deps.policyHook?.(agent.env, agent.businessId, {
    type: "credential",
    agentId: agent.agentId,
    walletId: agent.walletId,
    sellerId: input.sellerId,
    amountMicros: input.maxMicros,
  });

  const iat = Math.floor(deps.now().getTime() / 1000);
  const exp = iat + input.ttlSeconds;
  const id = newId("crd");
  const row = await sql.begin(async (tx) => {
    await post(
      tx,
      agent.env,
      "hold",
      id,
      [
        { account: acct.available(agent.walletId), deltaMicros: -input.maxMicros },
        { account: acct.held(agent.walletId), deltaMicros: input.maxMicros },
      ],
      { businessId: agent.businessId, walletId: agent.walletId, counterparty: input.sellerId, amountMicros: -input.maxMicros },
    );
    const [r] = await tx<CredentialRow[]>`
      insert into credentials (id, env, agent_id, wallet_id, business_id, seller_id, max_micros, remaining_micros, status, expires_at, created_at)
      values (${id}, ${agent.env}, ${agent.agentId}, ${agent.walletId}, ${agent.businessId}, ${input.sellerId},
              ${input.maxMicros}, ${input.maxMicros}, 'active', ${new Date(exp * 1000)}, ${deps.now()})
      returning *`;
    return r!;
  });

  const token = await signToken(deps, "gaitway-credential+jwt", {
    sub: agent.agentId,
    aud: input.sellerId,
    jti: id,
    iat,
    exp,
    env: agent.env,
    biz: { id: biz.id, name: biz.name, email: biz.email, verified: biz.verified },
    agent: { id: a.id, name: a.name },
    max: input.maxMicros.toString(),
    cur: "USD",
  });
  return credentialJson(row, deps.now(), token);
}

/**
 * Returns the credential's remaining hold to the wallet and sets its final
 * status. The caller must hold the credential row lock (SELECT … FOR UPDATE).
 */
export async function closeCredential(tx: Tx, row: CredentialRow, status: "released" | "expired" | "exhausted"): Promise<CredentialRow> {
  if (row.remaining_micros > 0n) {
    await post(
      tx,
      row.env,
      "release",
      row.id,
      [
        { account: acct.held(row.wallet_id), deltaMicros: -row.remaining_micros },
        { account: acct.available(row.wallet_id), deltaMicros: row.remaining_micros },
      ],
      { businessId: row.business_id, walletId: row.wallet_id, counterparty: row.seller_id, amountMicros: row.remaining_micros },
    );
  }
  const [u] = await tx<CredentialRow[]>`
    update credentials set status = ${status}, remaining_micros = 0 where id = ${row.id} returning *`;
  return u!;
}

export async function lockCredential(tx: Tx, id: string): Promise<CredentialRow | undefined> {
  const [r] = await tx<CredentialRow[]>`select * from credentials where id = ${id} for update`;
  return r;
}
