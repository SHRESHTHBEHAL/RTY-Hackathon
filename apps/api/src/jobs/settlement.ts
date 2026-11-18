import type { Env } from "../config.js";
import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import { newId } from "../ids.js";
import { post, type Entry } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import type { SettleItem } from "../vault/types.js";

type BatchRow = { id: string; env: Env; status: "pending" | "submitted" | "confirmed" | "failed"; gross_micros: bigint; fee_micros: bigint };
type ItemRow = { business_id: string; seller_id: string; gross_micros: bigint; fee_micros: bigint };

/**
 * One settlement round. Batch states: pending → submitted → confirmed, or failed.
 *
 * - Creating a batch assigns every unsettled charge to it and posts
 *   owed → settling and fees → settling in the same transaction.
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

  const vaultItems: SettleItem[] = items.map((i) => ({
    businessId: i.business_id,
    sellerId: i.seller_id,
    grossMicros: i.gross_micros,
    feeMicros: i.fee_micros,
  }));
  let result: { txHash: string | null; alreadyDone: boolean };
  try {
    result = await deps.vault.settle(batch.id, vaultItems);
  } catch (e) {
    await failBatch(deps, batch, items, (e as Error).message);
    deps.state.settlementPaused = true;
    deps.state.pauseReason = `settlement batch ${batch.id} rejected by the vault: ${(e as Error).message}`;
    log("settlement paused", { batchId: batch.id, error: (e as Error).message });
    return { batchId: batch.id };
  }
  await deps.hooks?.afterVaultSettle?.(batch.id);

  await confirmBatch(deps, batch, items, result.txHash);
  return { batchId: batch.id };
}

async function createBatch(deps: Deps, env: Env): Promise<BatchRow | undefined> {
  try {
    return await deps.sql.begin(async (tx) => {
      const charges = await tx<{ id: string; business_id: string; seller_id: string; amount_micros: bigint; fee_micros: bigint }[]>`
        select id, business_id, seller_id, amount_micros, fee_micros from charges
        where env = ${env} and batch_id is null order by seq for update`;
      if (charges.length === 0) return undefined;
      const id = newId("stl");
      const groups = new Map<string, ItemRow>();
      const netBySeller = new Map<string, bigint>();
      let gross = 0n;
      let fee = 0n;
      for (const c of charges) {
        const key = `${c.business_id}|${c.seller_id}`;
        const g = groups.get(key) ?? { business_id: c.business_id, seller_id: c.seller_id, gross_micros: 0n, fee_micros: 0n };
        g.gross_micros += c.amount_micros;
        g.fee_micros += c.fee_micros;
        groups.set(key, g);
        netBySeller.set(c.seller_id, (netBySeller.get(c.seller_id) ?? 0n) + c.amount_micros - c.fee_micros);
        gross += c.amount_micros;
        fee += c.fee_micros;
      }
      const [batch] = await tx<BatchRow[]>`
        insert into settlement_batches (id, env, status, gross_micros, fee_micros) values (${id}, ${env}, 'pending', ${gross}, ${fee})
        returning *`;
      await tx`update charges set batch_id = ${id} where id = any(${charges.map((c) => c.id)}::text[])`;
      for (const g of groups.values()) {
        await tx`insert into settlement_items (batch_id, business_id, seller_id, gross_micros, fee_micros)
                 values (${id}, ${g.business_id}, ${g.seller_id}, ${g.gross_micros}, ${g.fee_micros})`;
      }
      const entries: Entry[] = [...netBySeller].map(([sellerId, net]) => ({ account: acct.owed(sellerId), deltaMicros: -net }));
      entries.push({ account: acct.fees(), deltaMicros: -fee });
      entries.push({ account: acct.settling(id), deltaMicros: gross });
      await post(tx, env, "settlement", id, entries);
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
    await post(tx, b.env, "settlement_confirm", b.id, [
      { account: acct.settling(b.id), deltaMicros: -b.gross_micros },
      { account: acct.external(), deltaMicros: b.gross_micros },
    ]);
    const netBySeller = new Map<string, bigint>();
    for (const i of items) netBySeller.set(i.seller_id, (netBySeller.get(i.seller_id) ?? 0n) + i.gross_micros - i.fee_micros);
    for (const [sellerId, net] of netBySeller) {
      await tx`insert into payouts (id, env, seller_id, batch_id, amount_micros, status, tx_hash)
               values (${newId("pay")}, ${b.env}, ${sellerId}, ${b.id}, ${net}, 'sent', ${txHash})
               on conflict (batch_id, seller_id) do nothing`;
    }
    await tx`update charges set settled_at = now() where batch_id = ${b.id}`;
    await tx`update settlement_batches set status = 'confirmed', tx_hash = ${txHash}, updated_at = now() where id = ${b.id}`;
  });
}

async function failBatch(deps: Deps, batch: BatchRow, items: ItemRow[], error: string) {
  await deps.sql.begin(async (tx) => {
    const [b] = await tx<BatchRow[]>`select * from settlement_batches where id = ${batch.id} for update`;
    if (!b || (b.status !== "pending" && b.status !== "submitted")) return;
    const netBySeller = new Map<string, bigint>();
    for (const i of items) netBySeller.set(i.seller_id, (netBySeller.get(i.seller_id) ?? 0n) + i.gross_micros - i.fee_micros);
    const entries: Entry[] = [...netBySeller].map(([sellerId, net]) => ({ account: acct.owed(sellerId), deltaMicros: net }));
    entries.push({ account: acct.fees(), deltaMicros: b.fee_micros });
    entries.push({ account: acct.settling(b.id), deltaMicros: -b.gross_micros });
    await post(tx, b.env, "settlement_failed", b.id, entries);
    await tx`update charges set batch_id = null where batch_id = ${b.id}`;
    await tx`update settlement_batches set status = 'failed', error = ${error}, updated_at = now() where id = ${b.id}`;
  });
}
