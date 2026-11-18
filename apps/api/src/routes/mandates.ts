import { z } from "zod";
import type { App } from "../app.js";
import type { Env } from "../config.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { iso, listParams, page, readJson, seqBound } from "../http.js";
import { newId } from "../ids.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { withIdempotency } from "../idempotency.js";
import { post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { signToken } from "../credentials/signer.js";
import { checkRules, utcDayStart } from "../rules/check.js";
import { chargeJson, feeFor, type ChargeRow } from "./charges.js";
import { enqueueWebhook } from "../jobs/webhooks.js";

type Period = "day" | "week" | "month";
const YEAR_S = 365 * 86400;

export function periodStart(period: Period, now: Date): Date {
  const day = utcDayStart(now);
  if (period === "day") return day;
  if (period === "week") return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

type MandateRow = {
  id: string;
  seq: bigint;
  env: Env;
  wallet_id: string;
  agent_id: string;
  business_id: string;
  seller_id: string;
  max_per_period: bigint;
  period: Period;
  status: "active" | "revoked";
  expires_at: Date;
  created_at: Date;
};
export const mandateJson = (m: MandateRow, token?: string) => ({
  id: m.id,
  walletId: m.wallet_id,
  agentId: m.agent_id,
  sellerId: m.seller_id,
  maxPerPeriodMicros: m.max_per_period.toString(),
  period: m.period,
  status: m.status,
  createdAt: iso(m.created_at),
  ...(token !== undefined ? { token } : {}),
});

const CreateBody = z.object({ sellerId: z.string().min(1), maxPerPeriodMicros: zMicros, period: z.enum(["day", "week", "month"]) });
const ChargeBody = z.object({ mandateId: z.string().min(1), amountMicros: zMicros, description: z.string().max(500).nullable().optional() });

export function registerMandateRoutes(app: App, deps: Deps) {
  const { sql } = deps;

  app.post("/v1/mandates", requireAuth(deps, ["agent"]), async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, CreateBody);
    const [a] = await sql<{ id: string; name: string; status: string }[]>`select id, name, status from agents where id = ${p.agentId!}`;
    if (!a || a.status !== "active") throw new ApiError("forbidden", "This agent is disabled");
    const [seller] = await sql`select id from sellers where id = ${b.sellerId} and env = ${p.env}`;
    if (!seller) throw new ApiError("not_found", "No such seller");
    // The per-payment maximum is checked on each mandate charge; the allow-list here.
    await checkRules(sql, { agentId: a.id, sellerId: b.sellerId, amountMicros: null, at: "authorise", now: deps.now() });
    await deps.policyHook?.(p.env, p.businessId!, {
      type: "mandate",
      agentId: a.id,
      walletId: p.walletId!,
      sellerId: b.sellerId,
      amountMicros: b.maxPerPeriodMicros,
    });
    const [biz] = await sql<{ id: string; name: string; verified: boolean; email: string }[]>`
      select bz.id, bz.name, bz.verified, ac.email from businesses bz join accounts ac on ac.id = bz.account_id where bz.id = ${p.businessId!}`;
    const iat = Math.floor(deps.now().getTime() / 1000);
    const exp = iat + YEAR_S;
    const id = newId("mdt");
    const [m] = await sql<MandateRow[]>`
      insert into mandates (id, env, wallet_id, agent_id, business_id, seller_id, max_per_period, period, status, expires_at, created_at)
      values (${id}, ${p.env}, ${p.walletId!}, ${a.id}, ${p.businessId!}, ${b.sellerId}, ${b.maxPerPeriodMicros}, ${b.period}, 'active',
              ${new Date(exp * 1000)}, ${deps.now()})
      returning *`;
    const token = await signToken(deps, "gaitway-mandate+jwt", {
      sub: a.id,
      aud: b.sellerId,
      jti: id,
      iat,
      exp,
      env: p.env,
      biz: { id: biz!.id, name: biz!.name, email: biz!.email, verified: biz!.verified },
      agent: { id: a.id, name: a.name },
      cur: "USD",
      maxPerPeriod: b.maxPerPeriodMicros.toString(),
      period: b.period,
    });
    return c.json({ mandate: mandateJson(m!, token) });
  });

  const biz = requireAuth(deps, ["business"]);
  app.get("/v1/mandates", biz, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<MandateRow[]>`
      select * from mandates where env = ${p.env} and business_id = ${p.businessId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, (m) => mandateJson(m)));
  });

  app.delete("/v1/mandates/:id", biz, async (c) => {
    const p = c.get("principal");
    const m = await sql.begin(async (tx) => {
      const [m] = await tx<MandateRow[]>`
        select * from mandates where id = ${c.req.param("id")} and env = ${p.env} and business_id = ${p.businessId!} for update`;
      if (!m) throw new ApiError("not_found", "No such mandate");
      if (m.status === "revoked") return m;
      const [u] = await tx<MandateRow[]>`update mandates set status = 'revoked' where id = ${m.id} returning *`;
      await enqueueWebhook(tx, deps, u!.seller_id, "mandate.revoked", { mandate: mandateJson(u!) });
      return u!;
    });
    return c.json({ mandate: mandateJson(m) });
  });

  app.post("/v1/mandate-charges", requireAuth(deps, ["seller"]), async (c) => {
    const p = c.get("principal");
    return withIdempotency(c, deps, `mandate-charge:${p.sellerId}`, async (tx) => {
      const b = await readJson(c, ChargeBody);
      const now = deps.now();
      const [m] = await tx<MandateRow[]>`select * from mandates where id = ${b.mandateId} for update`;
      if (!m || m.env !== p.env) throw new ApiError("not_found", "No such mandate");
      if (m.seller_id !== p.sellerId) throw new ApiError("forbidden", "This mandate names another seller");
      if (m.status !== "active") throw new ApiError("credential_not_active", "The mandate has been revoked");
      if (m.expires_at.getTime() <= now.getTime()) throw new ApiError("credential_expired", "The mandate has expired");
      const amount = b.amountMicros;
      await checkRules(tx, { agentId: m.agent_id, sellerId: m.seller_id, amountMicros: amount, at: "transfer", now });
      const [used] = await tx<{ total: bigint }[]>`
        select coalesce(sum(amount_micros), 0)::bigint as total from charges
        where mandate_id = ${m.id} and created_at >= ${periodStart(m.period, now)}`;
      if ((used?.total ?? 0n) + amount > m.max_per_period) {
        throw new ApiError("rule_violation", `This would exceed the mandate's ${m.period} maximum`, { rule: "maxPerPeriodMicros" });
      }
      const fee = feeFor(amount, deps.config.platformFeeBps);
      const id = newId("chg");
      await post(
        tx,
        m.env,
        "charge",
        id,
        [
          { account: acct.available(m.wallet_id), deltaMicros: -amount },
          { account: acct.owed(m.seller_id), deltaMicros: amount - fee },
          { account: acct.fees(), deltaMicros: fee },
        ],
        { businessId: m.business_id, walletId: m.wallet_id, counterparty: m.seller_id, amountMicros: -amount },
      );
      const [ch] = await tx<ChargeRow[]>`
        insert into charges (id, env, mandate_id, seller_id, agent_id, business_id, wallet_id, amount_micros, fee_micros, description, created_at)
        values (${id}, ${m.env}, ${m.id}, ${m.seller_id}, ${m.agent_id}, ${m.business_id}, ${m.wallet_id}, ${amount}, ${fee},
                ${b.description ?? null}, ${now})
        returning *`;
      return { status: 200, body: { charge: chargeJson(ch!) } };
    });
  });
}
