import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { readJson } from "../http.js";
import { requireAuth } from "../auth/middleware.js";

/** https, or plain http only for localhost / 127.0.0.1 / [::1]. */
export const hookUrl = z
  .string()
  .url()
  .refine((u) => {
    const url = new URL(u);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  }, "url must be https (plain http is allowed only for localhost)");

export function registerWebhookRoutes(app: App, deps: Deps) {
  app.put("/v1/webhook", requireAuth(deps, ["seller"]), async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, z.object({ url: hookUrl }));
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    await deps.sql`
      insert into webhook_endpoints (seller_id, url, secret) values (${p.sellerId!}, ${b.url}, ${secret})
      on conflict (seller_id) do update set url = excluded.url, secret = excluded.secret, updated_at = now()`;
    return c.json({ url: b.url, secret });
  });
}
