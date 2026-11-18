import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { iso, listParams, page, readJson, seqBound } from "../http.js";
import { newId } from "../ids.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { withIdempotency } from "../idempotency.js";
import { balanceOf, post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { closeCredential, lockCredential, type CredentialRow } from "../credentials/service.js";

const ChargeBody = z.object({
  credentialId: z.string().min(1),
  amountMicros: zMicros,
  final: z.boolean().optional(),
  description: z.string().max(500).nullable().optional(),
});

export type ChargeRow = {
  id: string;
  seq: bigint;
  credential_id: string | null;
  mandate_id: string | null;
  seller_id: string;
  agent_id: string;
  amount_micros: bigint;
  fee_micros: bigint;
  refunded_micros: bigint;
  description: string | null;
  created_at: Date;
};

export const chargeJson = (r: ChargeRow) => ({
  id: r.id,
  credentialId: r.credential_id,
  mandateId: r.mandate_id,
  sellerId: r.seller_id,
  agentId: r.agent_id,
  amountMicros: r.amount_micros.toString(),
  feeMicros: r.fee_micros.toString(),
  refundedMicros: r.refunded_micros.toString(),
  description: r.description,
  createdAt: iso(r.created_at),
});

export const feeFor = (amount: bigint, bps: number) => (amount * BigInt(bps)) / 10000n;

export function registerChargeRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const seller = requireAuth(deps, ["seller"]);

  app.post("/v1/charges", seller, async (c) => {
    const p = c.get("principal");
    return withIdempotency(c, deps, `charge:${p.sellerId}`, async (tx) => {
      const body = await readJson(c, ChargeBody);
      const now = deps.now();
      const cr = await lockCredential(tx, body.credentialId);
      if (!cr || cr.env !== p.env) throw new ApiError("not_found", "No such credential");
      if (cr.seller_id !== p.sellerId) throw new ApiError("forbidden", "This credential names another seller");
      if (cr.status === "expired" || (cr.status === "active" && cr.expires_at.getTime() <= now.getTime())) {
        throw new ApiError("credential_expired");
      }
      if (cr.status !== "active") throw new ApiError("credential_not_active", `The credential is ${cr.status}`);
      const amount = body.amountMicros;
      if (amount > cr.remaining_micros) {
        throw new ApiError("amount_exceeds_remaining", undefined, { remainingMicros: cr.remaining_micros.toString() });
      }
      const fee = feeFor(amount, deps.config.platformFeeBps);
      const id = newId("chg");
      await post(
        tx,
        cr.env,
        "charge",
        id,
        [
          { account: acct.held(cr.wallet_id), deltaMicros: -amount },
          { account: acct.owed(cr.seller_id), deltaMicros: amount - fee },
          { account: acct.fees(), deltaMicros: fee },
        ],
        { businessId: cr.business_id, walletId: cr.wallet_id, counterparty: cr.seller_id, amountMicros: -amount },
      );
      const [ch] = await tx<ChargeRow[]>`
        insert into charges (id, env, credential_id, seller_id, agent_id, business_id, wallet_id, amount_micros, fee_micros, description, created_at)
        values (${id}, ${cr.env}, ${cr.id}, ${cr.seller_id}, ${cr.agent_id}, ${cr.business_id}, ${cr.wallet_id},
                ${amount}, ${fee}, ${body.description ?? null}, ${now})
        returning *`;
      const remaining = cr.remaining_micros - amount;
      let [updated] = await tx<CredentialRow[]>`
        update credentials set remaining_micros = ${remaining} where id = ${cr.id} returning *`;
      if (remaining === 0n) {
        [updated] = await tx<CredentialRow[]>`update credentials set status = 'exhausted' where id = ${cr.id} returning *`;
      } else if (body.final) {
        updated = await closeCredential(tx, updated!, "released");
      }
      return { status: 200, body: { charge: chargeJson(ch!), remainingMicros: updated!.remaining_micros.toString() } };
    });
  });

  app.get("/v1/charges", seller, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<ChargeRow[]>`
      select * from charges where env = ${p.env} and seller_id = ${p.sellerId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, chargeJson));
  });

  app.get("/v1/payments", requireAuth(deps, ["agent"]), async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<ChargeRow[]>`
      select * from charges where env = ${p.env} and agent_id = ${p.agentId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, chargeJson));
  });

  app.get("/v1/seller/balance", seller, async (c) => {
    const p = c.get("principal");
    const owed = await balanceOf(sql, p.env, "owed", p.sellerId!);
    const [row] = await sql<{ paid: bigint }[]>`
      select coalesce(sum(amount_micros), 0)::bigint as paid from payouts
      where env = ${p.env} and seller_id = ${p.sellerId!} and status = 'sent'`;
    const paid = row?.paid ?? 0n;
    return c.json({ owedMicros: owed.toString(), paidOutMicros: paid.toString() });
  });
}
