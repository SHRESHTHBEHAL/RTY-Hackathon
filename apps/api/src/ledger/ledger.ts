import type { Tx } from "../db/client.js";
import type { Env } from "../config.js";
import { ApiError } from "../errors.js";
import { newId } from "../ids.js";

export type Kind = "external" | "unallocated" | "available" | "held" | "owed" | "fees" | "settling" | "withdrawing";
export type AccountRef = { kind: Kind; ownerId: string };
export type Entry = { account: AccountRef; deltaMicros: bigint };

/** Display data stored with a posting, used by GET /v1/transactions. */
export type PostingMeta = {
  businessId?: string | null;
  walletId?: string | null;
  counterparty?: string | null;
  amountMicros?: bigint | null;
};

/** insufficient_funds, remembering which ledger account would have gone negative. */
export class InsufficientFunds extends ApiError {
  readonly accountKind: Kind;
  constructor(kind: Kind) {
    super("insufficient_funds", insufficientMessage(kind));
    this.accountKind = kind;
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The only function that changes balances. Must run inside a transaction.
 * Locks the touched account rows in a fixed order (kind, then owner),
 * rejects postings that do not sum to zero, and rejects any posting that
 * would take a non-external account below zero with insufficient_funds.
 */
export async function post(
  tx: Tx,
  env: Env,
  type: string,
  ref: string,
  entries: Entry[],
  meta: PostingMeta = {},
): Promise<string> {
  const merged = new Map<string, { kind: Kind; ownerId: string; delta: bigint }>();
  let sum = 0n;
  for (const e of entries) {
    if (typeof e.deltaMicros !== "bigint") throw new Error("ledger: delta must be bigint");
    sum += e.deltaMicros;
    const key = `${e.account.kind}\u0000${e.account.ownerId}`;
    const cur = merged.get(key);
    if (cur) cur.delta += e.deltaMicros;
    else merged.set(key, { kind: e.account.kind, ownerId: e.account.ownerId, delta: e.deltaMicros });
  }
  if (sum !== 0n) throw new Error(`ledger: posting ${type}/${ref} does not sum to zero (${sum})`);
  const list = [...merged.values()]
    .filter((e) => e.delta !== 0n)
    .sort((a, b) => cmp(a.kind, b.kind) || cmp(a.ownerId, b.ownerId));
  if (list.length === 0) throw new Error(`ledger: posting ${type}/${ref} is empty`);

  // Create missing account rows (sorted), then lock all touched rows in the same order.
  for (const e of list) {
    await tx`insert into ledger_accounts (env, kind, owner_id) values (${env}, ${e.kind}, ${e.ownerId})
             on conflict (env, kind, owner_id) do nothing`;
  }
  const keys = list.map((e) => `${e.kind}:${e.ownerId}`);
  const rows = await tx<{ id: bigint; kind: Kind; owner_id: string; balance_micros: bigint }[]>`
    select id, kind, owner_id, balance_micros from ledger_accounts
    where env = ${env} and (kind || ':' || owner_id) = any(${keys}::text[])
    order by kind collate "C", owner_id collate "C"
    for update`;
  if (rows.length !== list.length) throw new Error("ledger: account rows missing after insert");

  const byKey = new Map(rows.map((r) => [`${r.kind}:${r.owner_id}`, r]));
  for (const e of list) {
    const row = byKey.get(`${e.kind}:${e.ownerId}`)!;
    const next = row.balance_micros + e.delta;
    if (e.kind !== "external" && next < 0n) {
      throw new InsufficientFunds(e.kind);
    }
  }

  const postingId = newId("pst");
  await tx`insert into postings (id, env, type, ref, business_id, wallet_id, counterparty, amount_micros)
           values (${postingId}, ${env}, ${type}, ${ref}, ${meta.businessId ?? null}, ${meta.walletId ?? null},
                   ${meta.counterparty ?? null}, ${meta.amountMicros ?? null})`;
  for (const e of list) {
    const row = byKey.get(`${e.kind}:${e.ownerId}`)!;
    await tx`update ledger_accounts set balance_micros = balance_micros + ${e.delta} where id = ${row.id}`;
    await tx`insert into entries (posting_id, account_id, delta_micros) values (${postingId}, ${row.id}, ${e.delta})`;
  }
  return postingId;
}

function insufficientMessage(kind: Kind): string {
  switch (kind) {
    case "unallocated":
      return "Unallocated balance too low";
    case "available":
      return "Wallet available balance too low";
    case "held":
      return "Held balance too low";
    case "owed":
      return "Seller balance too low";
    default:
      return "Balance too low";
  }
}

export async function balanceOf(tx: Tx | import("../db/client.js").Db, env: Env, kind: Kind, ownerId: string): Promise<bigint> {
  const rows = await tx<{ balance_micros: bigint }[]>`
    select balance_micros from ledger_accounts where env = ${env} and kind = ${kind} and owner_id = ${ownerId}`;
  return rows[0]?.balance_micros ?? 0n;
}

/** Balances for many owners of one kind at once; missing owners are 0. */
export async function balancesOf(
  db: Tx | import("../db/client.js").Db,
  env: Env,
  kind: Kind,
  ownerIds: string[],
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>(ownerIds.map((id) => [id, 0n]));
  if (ownerIds.length === 0) return out;
  const rows = await db<{ owner_id: string; balance_micros: bigint }[]>`
    select owner_id, balance_micros from ledger_accounts
    where env = ${env} and kind = ${kind} and owner_id = any(${ownerIds}::text[])`;
  for (const r of rows) out.set(r.owner_id, r.balance_micros);
  return out;
}
