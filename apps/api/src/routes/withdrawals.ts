import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import { iso, listParams, page, readJson, seqBound } from "../http.js";
import { newId } from "../ids.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { processWithdrawal } from "../jobs/withdrawals.js";

type Row = { id: string; seq: bigint; amount_micros: bigint; status: "pending" | "sent"; tx_hash: string | null; created_at: Date };
const json = (w: Row) => ({ id: w.id, amountMicros: w.amount_micros.toString(), status: w.status, txHash: w.tx_hash, createdAt: iso(w.created_at) });

export function registerWithdrawalRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const biz = requireAuth(deps, ["business"]);

  app.post("/v1/withdrawals", biz, async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, z.object({ amountMicros: zMicros }));
    const id = newId("wdr");
    await sql.begin(async (tx) => {
      await post(
        tx,
        p.env,
        "withdrawal",
        id,
        [
          { account: acct.unallocated(p.businessId!), deltaMicros: -b.amountMicros },
          { account: { kind: "withdrawing", ownerId: id }, deltaMicros: b.amountMicros },
        ],
        { businessId: p.businessId!, amountMicros: -b.amountMicros },
      );
      await tx`insert into withdrawals (id, env, business_id, amount_micros, status) values (${id}, ${p.env}, ${p.businessId!}, ${b.amountMicros}, 'pending')`;
    });
    try {
      await processWithdrawal(deps, id);
    } catch (e) {
      logOf(deps)("withdrawal will be retried by the job", { id, error: (e as Error).message });
    }
    const [w] = await sql<Row[]>`select * from withdrawals where id = ${id}`;
    return c.json({ withdrawal: json(w!) });
  });

  app.get("/v1/withdrawals", biz, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<Row[]>`
      select * from withdrawals where env = ${p.env} and business_id = ${p.businessId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, json));
  });
}
