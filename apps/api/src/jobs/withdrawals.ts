import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import { post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";

type WithdrawalRow = { id: string; env: "test" | "live"; business_id: string; amount_micros: bigint; status: "pending" | "sent" };

/**
 * Sends one pending withdrawal through the vault. Keyed by the withdrawal ID,
 * so a retry after a crash gets alreadyDone and completes without paying twice.
 * A vault error leaves it pending for the next run.
 */
export async function processWithdrawal(deps: Deps, id: string): Promise<boolean> {
  const [w] = await deps.sql<WithdrawalRow[]>`select * from withdrawals where id = ${id}`;
  if (!w || w.status !== "pending") return false;
  let res: { txHash: string | null; alreadyDone: boolean };
  try {
    res = await deps.vault.withdraw(w.id, w.business_id, w.amount_micros);
  } catch (e) {
    logOf(deps)("withdrawal failed; will retry", { id: w.id, error: (e as Error).message });
    return false;
  }
  await deps.hooks?.afterVaultWithdraw?.(w.id);
  return deps.sql.begin(async (tx) => {
    const [cur] = await tx<WithdrawalRow[]>`select * from withdrawals where id = ${w.id} for update`;
    if (!cur || cur.status !== "pending") return false;
    await post(tx, cur.env, "withdrawal_sent", cur.id, [
      { account: { kind: "withdrawing", ownerId: cur.id }, deltaMicros: -cur.amount_micros },
      { account: acct.external(), deltaMicros: cur.amount_micros },
    ]);
    await tx`update withdrawals set status = 'sent', tx_hash = ${res.txHash} where id = ${cur.id}`;
    return true;
  });
}

export async function runWithdrawalJob(deps: Deps): Promise<number> {
  const pending = await deps.sql<{ id: string }[]>`select id from withdrawals where status = 'pending' order by seq limit 100`;
  let n = 0;
  for (const p of pending) {
    try {
      if (await processWithdrawal(deps, p.id)) n++;
    } catch (e) {
      logOf(deps)("withdrawal job error", { id: p.id, error: (e as Error).message });
    }
  }
  return n;
}
