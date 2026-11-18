import type { Env } from "../config.js";
import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import { lastCreditedBlock } from "./deposits.js";

export type ReconcileResult = {
  ok: boolean;
  differences: Array<{ businessId: string; vaultMicros: string; ledgerMicros: string }>;
};

/**
 * For every business: vault balance (minus deposits the ledger has not yet
 * credited) must equal unallocated + every wallet's available and held +
 * the gross of its charges not yet settled on-chain. Any difference pauses
 * settlement until restart.
 */
export async function runReconcile(deps: Deps, env: Env = "test"): Promise<ReconcileResult> {
  const { sql, vault } = deps;
  const businesses = await sql<{ id: string; chain_key: string }[]>`select id, chain_key from businesses where env = ${env} order by id`;

  // Deposits after the last credited block (or not yet recorded) are not in the ledger yet.
  const from = (await lastCreditedBlock(deps)) + 1n;
  const head = (await vault.getConfirmedBlock()) + BigInt(deps.config.confirmations);
  const uncredited = new Map<string, bigint>();
  if (head >= from) {
    const events = await vault.getDeposits(from, head);
    const seen = new Set(
      (await sql<{ k: string }[]>`select tx_hash || ':' || log_index as k from deposits_seen where block_number >= ${from}`).map((r) => r.k),
    );
    for (const ev of events) {
      if (seen.has(`${ev.txHash}:${ev.logIndex}`)) continue;
      const key = ev.businessKey.toLowerCase();
      uncredited.set(key, (uncredited.get(key) ?? 0n) + ev.amountMicros);
    }
  }

  const ledger = await sql<{ business_id: string; total: bigint }[]>`
    select b.id as business_id,
      coalesce((select balance_micros from ledger_accounts where env = ${env} and kind = 'unallocated' and owner_id = b.id), 0)
      + coalesce((select sum(la.balance_micros) from ledger_accounts la join wallets w on w.id = la.owner_id
                  where la.env = ${env} and la.kind in ('available','held') and w.business_id = b.id), 0)
      + coalesce((select sum(c.amount_micros) from charges c where c.env = ${env} and c.business_id = b.id and c.settled_at is null), 0)
      as total
    from businesses b where b.env = ${env}`;
  const ledgerBy = new Map(ledger.map((r) => [r.business_id, BigInt(r.total)]));

  const differences: ReconcileResult["differences"] = [];
  for (const b of businesses) {
    const vaultMicros = (await vault.getBusinessBalance(b.id)) - (uncredited.get(b.chain_key.toLowerCase()) ?? 0n);
    const ledgerMicros = ledgerBy.get(b.id) ?? 0n;
    if (vaultMicros !== ledgerMicros) {
      differences.push({ businessId: b.id, vaultMicros: vaultMicros.toString(), ledgerMicros: ledgerMicros.toString() });
    }
  }
  if (differences.length > 0) {
    deps.state.settlementPaused = true;
    deps.state.pauseReason = "reconciliation found a difference";
    logOf(deps)("reconciliation difference; settlement paused", { differences });
  }
  return { ok: differences.length === 0, differences };
}
