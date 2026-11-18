import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import { newId } from "../ids.js";
import { post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";

export const DEPOSIT_CURSOR = "deposits";

/** Highest block whose deposits have been credited (-1 if none scanned yet). */
export async function lastCreditedBlock(deps: Deps): Promise<bigint> {
  const [row] = await deps.sql<{ last_block: bigint }[]>`select last_block from chain_cursor where name = ${DEPOSIT_CURSOR}`;
  return row?.last_block ?? -1n;
}

/**
 * Credits confirmed vault deposits to the business's unallocated balance.
 * Each (txHash, logIndex) is credited at most once. A deposit is matched to
 * the oldest pending test top-up of the same business and amount; otherwise
 * a confirmed top-up record is created for it.
 */
export async function runDepositJob(deps: Deps): Promise<number> {
  const log = logOf(deps);
  const confirmed = await deps.vault.getConfirmedBlock();
  const from = (await lastCreditedBlock(deps)) + 1n;
  if (from > confirmed) return 0;
  const events = await deps.vault.getDeposits(from, confirmed);
  let credited = 0;
  for (const ev of events) {
    const did = await deps.sql.begin(async (tx) => {
      const [biz] = await tx<{ id: string; env: "test" | "live" }[]>`
        select id, env from businesses where lower(chain_key) = ${ev.businessKey.toLowerCase()}`;
      const seen = await tx`
        insert into deposits_seen (tx_hash, log_index, business_id, amount_micros, block_number)
        values (${ev.txHash}, ${ev.logIndex}, ${biz?.id ?? null}, ${ev.amountMicros}, ${ev.blockNumber})
        on conflict do nothing returning tx_hash`;
      if (seen.length === 0) return false;
      if (!biz) {
        log("deposit for unknown business skipped", { businessKey: ev.businessKey, txHash: ev.txHash });
        return false;
      }
      const [pending] = await tx<{ id: string }[]>`
        select id from topups
        where env = ${biz.env} and business_id = ${biz.id} and status = 'pending' and method = 'test' and amount_micros = ${ev.amountMicros}
        order by seq asc limit 1 for update skip locked`;
      let topupId: string;
      if (pending) {
        topupId = pending.id;
        await tx`update topups set status = 'confirmed', tx_hash = ${ev.txHash} where id = ${topupId}`;
      } else {
        topupId = newId("top");
        await tx`insert into topups (id, env, business_id, amount_micros, method, status, tx_hash)
                 values (${topupId}, ${biz.env}, ${biz.id}, ${ev.amountMicros}, 'test', 'confirmed', ${ev.txHash})`;
      }
      await post(
        tx,
        biz.env,
        "topup",
        topupId,
        [
          { account: acct.external(), deltaMicros: -ev.amountMicros },
          { account: acct.unallocated(biz.id), deltaMicros: ev.amountMicros },
        ],
        { businessId: biz.id, amountMicros: ev.amountMicros },
      );
      return true;
    });
    if (did) credited++;
  }
  await deps.sql`
    insert into chain_cursor (name, last_block) values (${DEPOSIT_CURSOR}, ${confirmed})
    on conflict (name) do update set last_block = greatest(chain_cursor.last_block, excluded.last_block)`;
  return credited;
}
