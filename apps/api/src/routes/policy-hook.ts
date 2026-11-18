import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { readJson } from "../http.js";
import { requireAuth } from "../auth/middleware.js";
import { hookUrl } from "./webhook.js";

export function registerPolicyHookRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const biz = requireAuth(deps, ["business"]);

  app.get("/v1/policy-hook", biz, async (c) => {
    const p = c.get("principal");
    const [h] = await sql<{ url: string }[]>`select url from policy_hooks where business_id = ${p.businessId!} and env = ${p.env}`;
    return c.json({ url: h?.url ?? null });
  });

  app.put("/v1/policy-hook", biz, async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, z.object({ url: hookUrl }));
    const secret = `phsec_${randomBytes(24).toString("hex")}`;
    await sql`
      insert into policy_hooks (business_id, env, url, secret) values (${p.businessId!}, ${p.env}, ${b.url}, ${secret})
      on conflict (business_id) do update set url = excluded.url, secret = excluded.secret, updated_at = now()`;
    return c.json({ url: b.url, secret });
  });

  app.delete("/v1/policy-hook", biz, async (c) => {
    const p = c.get("principal");
    await sql`delete from policy_hooks where business_id = ${p.businessId!} and env = ${p.env}`;
    return c.json({ ok: true });
  });
}
