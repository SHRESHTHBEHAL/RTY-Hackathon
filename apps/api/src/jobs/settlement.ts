import type { Env } from "../config.js";
import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import type { Tx } from "../db/client.js";
import { newId } from "../ids.js";
import { post, type Entry } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import type { SettleItem } from "../vault/types.js";
import { enqueueWebhook } from "./webhooks.js";

type BatchRow = { id: string; env: Env; status: "pending" | "submitted" | "confirmed" | "failed"; gross_micros: bigint; fee_micros: bigint };
type ItemRow = { business_id: string; seller_id: string; gross_micros: bigint; fee_micros: bigint };

/**
 * One settlement round. Batch states: pending → submitted → confirmed, or failed.
 *
 * - Creating a batch assigns every unsettled charge and refund to it and posts
 *   owed → settling and fees → settling in the same transaction. Refunds net
 *   against charges of the same business and seller; a pair whose net would be
 *   negative waits for a later batch.
 * - The vault call is keyed by the batch ID, so after a crash the next run
 *   resubmits the same ID and the vault answers alreadyDone instead of paying twice.
 * - Confirming posts settling → external and writes one payout per seller.
 * - A vault rejection marks the batch failed, returns the money to owed and
 *   fees, and pauses settlement until the process restarts.
 */
export async function runSettlement(deps: Deps, env: Env = "test"): Promise<{ batchId: string | null }> {
  const log = logOf(deps);
  if (deps.state.settlementPaused) return { batchId: null };
  const { sql } = deps;

  const [open] = await sql<BatchRow[]>`select * from settlement_batches where env = ${env} and status in ('pending','submitted')`;
  const batch = open ?? (await createBatch(deps, env));
  if (!batch) return { batchId: null };

  const items = await sql<ItemRow[]>`select * from settlement_items where batch_id = ${batch.id} order by business_id, seller_id`;
  await sql`update settlement_batches set status = 'submitted', updated_at = now() where id = ${batch.id} and status = 'pending'`;
  await deps.hooks?.beforeVaultSettle?.(batch.id);

  const vaultItems: SettleItem[] = items
    .filter((i) => i.gross_micros > 0n)
    .map((i) => ({ businessId: i.business_id, sellerId: i.seller_id, grossMicros: i.gross_micros, feeMicros: i.fee_micros }));
  let result: { txHash: string | null; alreadyDone: boolean } = { txHash: null, alreadyDone: false };
  if (vaultItems.length > 0) {
    try {
      result = await deps.vault.settle(batch.id, vaultItems);
    } catch (e) {
      await failBatch(deps, batch, items, (e as Error).message);
      deps.state.settlementPaused = true;
      deps.state.pauseReason = `settlement batch ${batch.id} rejected by the vault: ${(e as Error).message}`;
      log("settlement paused", { batchId: batch.id, error: (e as Error).message });
      return { batchId: batch.id };
    }
  }
  await deps.hooks?.afterVaultSettle?.(batch.id);

  await confirmBatch(deps, batch, items, result.txHash);
  return { batchId: batch.id };
}

const netBySeller = (items: ItemRow[]) => {
  const m = new Map<string, bigint>();
  for (const i of items) m.set(i.seller_id, (m.get(i.seller_id) ?? 0n) + i.gross_micros - i.fee_micros);
  return m;
};

/** Posts `sign` × (owed + fees → settling) for these items; skips an all-zero posting. */
async function postSettling(tx: Tx, env: Env, type: string, batchId: string, items: ItemRow[], sign: 1n | -1n) {
  let gross = 0n;
  let fee = 0n;
  for (const i of items) {
    gross += i.gross_micros;
    fee += i.fee_micros;
  }
  const entries: Entry[] = [...netBySeller(items)].map(([sellerId, net]) => ({ account: acct.owed(sellerId), deltaMicros: -sign * net }));
  entries.push({ account: acct.fees(), deltaMicros: -sign * fee });
  entries.push({ account: acct.settling(batchId), deltaMicros: sign * gross });
  if (entries.every((e) => e.deltaMicros === 0n)) return;
  await post(tx, env, type, batchId, entries);
}

async function createBatch(deps: Deps, env: Env): Promise<BatchRow | undefined> {
  try {
    return await deps.sql.begin(async (tx) => {
      const charges = await tx<{ id: string; business_id: string; seller_id: string; amount_micros: bigint; fee_micros: bigint }[]>`
        select id, business_id, seller_id, amount_micros, fee_micros from charges
        where env = ${env} and batch_id is null order by seq for update`;
      const refunds = await tx<{ id: string; business_id: string; seller_id: string; amount_micros: bigint; fee_share_micros: bigint }[]>`
        select id, business_id, seller_id, amount_micros, fee_share_micros from refunds
        where env = ${env} and batch_id is null order by seq for update`;
      type Group = ItemRow & { chargeIds: string[]; refundIds: string[] };
      const groups = new Map<string, Group>();
      const group = (b: string, s: string) => {
        const key = `${b}|${s}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { business_id: b, seller_id: s, gross_micros: 0n, fee_micros: 0n, chargeIds: [], refundIds: [] }));
        return g;
      };
      for (const c of charges) {
        const g = group(c.business_id, c.seller_id);
        g.gross_micros += c.amount_micros;
        g.fee_micros += c.fee_micros;
        g.chargeIds.push(c.id);
      }
      for (const r of refunds) {
        const g = group(r.business_id, r.seller_id);
        g.gross_micros -= r.amount_micros;
        g.fee_micros -= r.fee_share_micros;
        g.refundIds.push(r.id);
      }
      const included = [...groups.values()].filter((g) => g.gross_micros >= 0n && g.fee_micros >= 0n && g.fee_micros <= g.gross_micros);
      if (included.length === 0) return undefined;

      const id = newId("stl");
      const gross = included.reduce((a, g) => a + g.gross_micros, 0n);
      const fee = included.reduce((a, g) => a + g.fee_micros, 0n);
      const [batch] = await tx<BatchRow[]>`
        insert into settlement_batches (id, env, status, gross_micros, fee_micros) values (${id}, ${env}, 'pending', ${gross}, ${fee})
        returning *`;
      const chargeIds = included.flatMap((g) => g.chargeIds);
      const refundIds = included.flatMap((g) => g.refundIds);
      if (chargeIds.length) await tx`update charges set batch_id = ${id} where id = any(${chargeIds}::text[])`;
      if (refundIds.length) await tx`update refunds set batch_id = ${id} where id = any(${refundIds}::text[])`;
      for (const g of included) {
        await tx`insert into settlement_items (batch_id, business_id, seller_id, gross_micros, fee_micros)
                 values (${id}, ${g.business_id}, ${g.seller_id}, ${g.gross_micros}, ${g.fee_micros})`;
      }
      await postSettling(tx, env, "settlement", id, included, 1n);
      return batch;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return undefined; // another runner opened a batch
    throw e;
  }
}

async function confirmBatch(deps: Deps, batch: BatchRow, items: ItemRow[], txHash: string | null) {
  await deps.sql.begin(async (tx) => {
    const [b] = await tx<BatchRow[]>`select * from settlement_batches where id = ${batch.id} for update`;
    if (!b || b.status === "confirmed") return;
    if (b.gross_micros > 0n) {
      await post(tx, b.env, "settlement_confirm", b.id, [
        { account: acct.settling(b.id), deltaMicros: -b.gross_micros },
        { account: acct.external(), deltaMicros: b.gross_micros },
      ]);
    }
    for (const [sellerId, net] of netBySeller(items)) {
      if (net <= 0n) continue;
      const [p] = await tx<{ id: string; seller_id: string; amount_micros: bigint; status: string; tx_hash: string | null; created_at: Date }[]>`
        insert into payouts (id, env, seller_id, batch_id, amount_micros, status, tx_hash)
        values (${newId("pay")}, ${b.env}, ${sellerId}, ${b.id}, ${net}, 'sent', ${txHash})
        on conflict (batch_id, seller_id) do nothing returning *`;
      if (p) {
        await enqueueWebhook(tx, deps, sellerId, "payout.sent", {
          payout: { id: p.id, sellerId, amountMicros: p.amount_micros.toString(), status: "sent", txHash: p.tx_hash, createdAt: p.created_at.toISOString() },
        });
      }
    }
    await tx`update charges set settled_at = now() where batch_id = ${b.id}`;
    await tx`update refunds set settled_at = now() where batch_id = ${b.id}`;
    await tx`update settlement_batches set status = 'confirmed', tx_hash = ${txHash}, updated_at = now() where id = ${b.id}`;
  });
}

async function failBatch(deps: Deps, batch: BatchRow, items: ItemRow[], error: string) {
  await deps.sql.begin(async (tx) => {
    const [b] = await tx<BatchRow[]>`select * from settlement_batches where id = ${batch.id} for update`;
    if (!b || (b.status !== "pending" && b.status !== "submitted")) return;
    await postSettling(tx, b.env, "settlement_failed", b.id, items, -1n);
    await tx`update charges set batch_id = null where batch_id = ${b.id}`;
    await tx`update refunds set batch_id = null where batch_id = ${b.id}`;
    await tx`update settlement_batches set status = 'failed', error = ${error}, updated_at = now() where id = ${b.id}`;
  });
}
