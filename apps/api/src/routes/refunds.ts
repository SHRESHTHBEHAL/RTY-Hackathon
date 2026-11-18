import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { iso, readJson } from "../http.js";
import { newId } from "../ids.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { withIdempotency } from "../idempotency.js";
import { InsufficientFunds, post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { chargeJson, type ChargeRow } from "./charges.js";
import { enqueueWebhook } from "../jobs/webhooks.js";

const RefundBody = z.object({ chargeId: z.string().min(1), amountMicros: zMicros.optional() });

type FullCharge = ChargeRow & { env: "test" | "live"; business_id: string; wallet_id: string; batch_id: string | null };
type RefundRow = { id: string; charge_id: string; amount_micros: bigint; created_at: Date };
const refundJson = (r: RefundRow) => ({ id: r.id, chargeId: r.charge_id, amountMicros: r.amount_micros.toString(), createdAt: iso(r.created_at) });

/**
 * Refunds return money to the agent's wallet out of the seller's unsettled
 * owed balance. For a charge not yet in a settlement batch, the platform fee
 * is returned in proportion (rounded down). For a settled charge the fee has
 * already been collected on-chain, so the seller's owed balance covers the
 * whole refund. Unsettled refunds net against the next settlement batch.
 */
export function registerRefundRoutes(app: App, deps: Deps) {
  app.post("/v1/refunds", requireAuth(deps, ["seller"]), async (c) => {
    const p = c.get("principal");
    return withIdempotency(c, deps, `refund:${p.sellerId}`, async (tx) => {
      const b = await readJson(c, RefundBody);
      const [ch] = await tx<FullCharge[]>`select * from charges where id = ${b.chargeId} for update`;
      if (!ch || ch.env !== p.env || ch.seller_id !== p.sellerId) throw new ApiError("not_found", "No such charge");
      const refundable = ch.amount_micros - ch.refunded_micros;
      const amount = b.amountMicros ?? refundable;
      if (refundable <= 0n) throw new ApiError("validation_failed", "This charge is already fully refunded");
      if (amount > refundable) {
        throw new ApiError("validation_failed", `At most ${refundable} micros can still be refunded`, { refundableMicros: refundable.toString() });
      }
      const feeShare = ch.batch_id === null ? (ch.fee_micros * amount) / ch.amount_micros : 0n;
      const id = newId("rfd");
      try {
        await post(
          tx,
          ch.env,
          "refund",
          id,
          [
            { account: acct.owed(ch.seller_id), deltaMicros: -(amount - feeShare) },
            { account: acct.fees(), deltaMicros: -feeShare },
            { account: acct.available(ch.wallet_id), deltaMicros: amount },
          ],
          { businessId: ch.business_id, walletId: ch.wallet_id, counterparty: ch.seller_id, amountMicros: amount },
        );
      } catch (e) {
        if (e instanceof InsufficientFunds && e.accountKind === "owed") throw new ApiError("insufficient_seller_balance");
        throw e;
      }
      const [r] = await tx<RefundRow[]>`
        insert into refunds (id, env, charge_id, seller_id, business_id, wallet_id, amount_micros, fee_share_micros, created_at)
        values (${id}, ${ch.env}, ${ch.id}, ${ch.seller_id}, ${ch.business_id}, ${ch.wallet_id}, ${amount}, ${feeShare}, ${deps.now()})
        returning *`;
      const [u] = await tx<ChargeRow[]>`update charges set refunded_micros = refunded_micros + ${amount} where id = ${ch.id} returning *`;
      await enqueueWebhook(tx, deps, ch.seller_id, "charge.refunded", { refund: refundJson(r!), charge: chargeJson(u!) });
      return { status: 200, body: { refund: refundJson(r!) } };
    });
  });
}
