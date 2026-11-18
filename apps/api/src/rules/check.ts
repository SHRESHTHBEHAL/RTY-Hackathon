import type { Db, Tx } from "../db/client.js";
import { ApiError } from "../errors.js";

export type Rules = { perPaymentMax: bigint | null; dailyMax: bigint | null; allowedSellerIds: string[] | null };

export async function getRules(db: Db | Tx, agentId: string): Promise<Rules> {
  const [r] = await db<{ per_payment_max: bigint | null; daily_max: bigint | null; allowed_seller_ids: string[] | null }[]>`
    select per_payment_max, daily_max, allowed_seller_ids from agent_rules where agent_id = ${agentId}`;
  return { perPaymentMax: r?.per_payment_max ?? null, dailyMax: r?.daily_max ?? null, allowedSellerIds: r?.allowed_seller_ids ?? null };
}

export const rulesJson = (r: Rules) => ({
  perPaymentMaxMicros: r.perPaymentMax?.toString() ?? null,
  dailyMaxMicros: r.dailyMax?.toString() ?? null,
  allowedSellerIds: r.allowedSellerIds,
});

export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Spending rules (context.md section 8, M2).
 * - "authorise" (credential/mandate creation): allow-list, and per-payment max against `amountMicros` if given.
 * - "charge": the UTC-day total including this charge must not exceed the daily max. Locks the
 *   agent row so concurrent charges for one agent are counted one after another. Must run in a transaction.
 * - "transfer": both.
 */
export async function checkRules(
  tx: Db | Tx,
  input: { agentId: string; sellerId: string; amountMicros: bigint | null; at: "authorise" | "charge" | "transfer"; now: Date },
): Promise<void> {
  const r = await getRules(tx, input.agentId);
  if (input.at !== "charge") {
    if (r.allowedSellerIds && !r.allowedSellerIds.includes(input.sellerId)) {
      throw new ApiError("rule_violation", "This seller is not on the agent's allow-list", { rule: "allowedSellerIds" });
    }
    if (r.perPaymentMax !== null && input.amountMicros !== null && input.amountMicros > r.perPaymentMax) {
      throw new ApiError("rule_violation", "Amount is above the agent's per-payment maximum", { rule: "perPaymentMaxMicros" });
    }
  }
  if (input.at !== "authorise" && r.dailyMax !== null && input.amountMicros !== null) {
    await tx`select id from agents where id = ${input.agentId} for update`;
    const start = utcDayStart(input.now);
    const end = new Date(start.getTime() + 86_400_000);
    const [row] = await tx<{ total: bigint }[]>`
      select coalesce(sum(amount_micros), 0)::bigint as total from charges
      where agent_id = ${input.agentId} and created_at >= ${start} and created_at < ${end}`;
    if ((row?.total ?? 0n) + input.amountMicros > r.dailyMax) {
      throw new ApiError("rule_violation", "This would take the agent above its daily maximum", { rule: "dailyMaxMicros" });
    }
  }
}
