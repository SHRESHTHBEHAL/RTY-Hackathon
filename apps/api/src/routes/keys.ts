import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { listParams, page, readJson, seqBound } from "../http.js";
import { requireAuth } from "../auth/middleware.js";
import { apiKeyJson, createApiKey, type KeyRow } from "../auth/keys.js";

export const LabelBody = z.object({ label: z.string().trim().min(1).max(100) });

/** /v1/keys: the business or seller key of the calling account. */
export function registerKeyRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const auth = requireAuth(deps, ["business", "seller"]);
  const ownerFilter = (p: { kind: string; businessId?: string; sellerId?: string }) =>
    p.kind === "business"
      ? sql`holder_kind = 'business' and business_id = ${p.businessId!}`
      : sql`holder_kind = 'seller' and seller_id = ${p.sellerId!}`;

  app.get("/v1/keys", auth, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<KeyRow[]>`
      select * from api_keys where env = ${p.env} and ${ownerFilter(p)} and revoked_at is null and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, apiKeyJson));
  });

  app.post("/v1/keys", auth, async (c) => {
    const p = c.get("principal");
    const body = await readJson(c, LabelBody);
    const out = await createApiKey(sql, p.env, p.kind as "business" | "seller", { businessId: p.businessId, sellerId: p.sellerId }, body.label);
    return c.json(out);
  });

  app.delete("/v1/keys/:id", auth, async (c) => {
    const p = c.get("principal");
    const rows = await sql`
      update api_keys set revoked_at = now()
      where id = ${c.req.param("id")} and env = ${p.env} and ${ownerFilter(p)} and revoked_at is null
      returning id`;
    if (rows.length === 0) throw new ApiError("not_found");
    return c.json({ ok: true });
  });
}
