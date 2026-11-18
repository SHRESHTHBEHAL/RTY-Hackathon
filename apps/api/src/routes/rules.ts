import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { readJson } from "../http.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { getRules, rulesJson } from "../rules/check.js";

const RulesBody = z.object({
  perPaymentMaxMicros: zMicros.nullable().optional(),
  dailyMaxMicros: zMicros.nullable().optional(),
  allowedSellerIds: z.array(z.string().min(1)).max(1000).nullable().optional(),
});

export function registerRuleRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const biz = requireAuth(deps, ["business"]);
  const own = async (env: string, businessId: string, id: string) => {
    const [a] = await sql`select id from agents where id = ${id} and env = ${env} and business_id = ${businessId}`;
    if (!a) throw new ApiError("not_found", "No such agent");
  };

  app.get("/v1/agents/:id/rules", biz, async (c) => {
    const p = c.get("principal");
    await own(p.env, p.businessId!, c.req.param("id"));
    return c.json({ rules: rulesJson(await getRules(sql, c.req.param("id"))) });
  });

  app.put("/v1/agents/:id/rules", biz, async (c) => {
    const p = c.get("principal");
    const id = c.req.param("id");
    await own(p.env, p.businessId!, id);
    const b = await readJson(c, RulesBody);
    const allowed = b.allowedSellerIds ?? null;
    await sql`
      insert into agent_rules (agent_id, env, per_payment_max, daily_max, allowed_seller_ids)
      values (${id}, ${p.env}, ${b.perPaymentMaxMicros ?? null}, ${b.dailyMaxMicros ?? null}, ${allowed === null ? null : sql.array(allowed)})
      on conflict (agent_id) do update set per_payment_max = excluded.per_payment_max, daily_max = excluded.daily_max,
        allowed_seller_ids = excluded.allowed_seller_ids, updated_at = now()`;
    return c.json({ rules: rulesJson(await getRules(sql, id)) });
  });
}
