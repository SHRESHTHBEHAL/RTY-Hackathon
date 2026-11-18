import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { iso, listParams, page, seqBound } from "../http.js";
import { requireAuth } from "../auth/middleware.js";

type PayoutRow = {
  id: string;
  seq: bigint;
  seller_id: string;
  amount_micros: bigint;
  status: "pending" | "sent";
  tx_hash: string | null;
  created_at: Date;
};

export function registerPayoutRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  app.get("/v1/payouts", requireAuth(deps, ["seller"]), async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<PayoutRow[]>`
      select * from payouts where env = ${p.env} and seller_id = ${p.sellerId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(
      page(rows, lp.limit, (r) => ({
        id: r.id,
        sellerId: r.seller_id,
        amountMicros: r.amount_micros.toString(),
        status: r.status,
        txHash: r.tx_hash,
        createdAt: iso(r.created_at),
      })),
    );
  });
}
