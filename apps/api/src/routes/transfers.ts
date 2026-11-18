import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { readJson } from "../http.js";
import { newId } from "../ids.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { withIdempotency } from "../idempotency.js";
import { post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { checkRules } from "../rules/check.js";
import { chargeJson, feeFor, type ChargeRow } from "./charges.js";

const TransferBody = z.object({ sellerId: z.string().min(1), amountMicros: zMicros, reference: z.string().max(500).nullable().optional() });

/** Push payment: available → seller owed, no credential (context.md section 8). */
export function registerTransferRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  app.post("/v1/transfers", requireAuth(deps, ["agent"]), async (c) => {
    const p = c.get("principal");
    if (!c.req.header("idempotency-key")) throw new ApiError("validation_failed", "An Idempotency-Key header is required");
    const b = await readJson(c, TransferBody);
    const [a] = await sql<{ status: string }[]>`select status from agents where id = ${p.agentId!}`;
    if (!a || a.status !== "active") throw new ApiError("forbidden", "This agent is disabled");
    const [seller] = await sql`select id from sellers where id = ${b.sellerId} and env = ${p.env}`;
    if (!seller) throw new ApiError("not_found", "No such seller");
    await checkRules(sql, { agentId: p.agentId!, sellerId: b.sellerId, amountMicros: b.amountMicros, at: "authorise", now: deps.now() });
    // The policy hook is called outside any transaction, so no row is locked while it answers.
    await deps.policyHook?.(p.env, p.businessId!, {
      type: "transfer",
      agentId: p.agentId!,
      walletId: p.walletId!,
      sellerId: b.sellerId,
      amountMicros: b.amountMicros,
    });
    return withIdempotency(c, deps, `transfer:${p.agentId}`, async (tx) => {
      const now = deps.now();
      const amount = b.amountMicros;
      await checkRules(tx, { agentId: p.agentId!, sellerId: b.sellerId, amountMicros: amount, at: "charge", now });
      const fee = feeFor(amount, deps.config.platformFeeBps);
      const id = newId("chg");
      await post(
        tx,
        p.env,
        "charge",
        id,
        [
          { account: acct.available(p.walletId!), deltaMicros: -amount },
          { account: acct.owed(b.sellerId), deltaMicros: amount - fee },
          { account: acct.fees(), deltaMicros: fee },
        ],
        { businessId: p.businessId!, walletId: p.walletId!, counterparty: b.sellerId, amountMicros: -amount },
      );
      const [ch] = await tx<ChargeRow[]>`
        insert into charges (id, env, seller_id, agent_id, business_id, wallet_id, amount_micros, fee_micros, description, created_at)
        values (${id}, ${p.env}, ${b.sellerId}, ${p.agentId!}, ${p.businessId!}, ${p.walletId!}, ${amount}, ${fee}, ${b.reference ?? null}, ${now})
        returning *`;
      return { status: 200, body: { charge: chargeJson(ch!) } };
    });
  });
}
