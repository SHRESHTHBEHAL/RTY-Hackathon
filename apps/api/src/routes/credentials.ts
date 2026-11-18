import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { readJson } from "../http.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { closeCredential, createCredential, credentialJson, lockCredential, type CredentialRow } from "../credentials/service.js";

const CreateBody = z.object({
  sellerId: z.string().min(1),
  maxMicros: zMicros,
  ttlSeconds: z.number().int().min(10).max(86400).optional(),
});

export function registerCredentialRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const agentOnly = requireAuth(deps, ["agent"]);

  app.post("/v1/credentials", agentOnly, async (c) => {
    const p = c.get("principal");
    const body = await readJson(c, CreateBody);
    const credential = await createCredential(
      deps,
      { env: p.env, agentId: p.agentId!, walletId: p.walletId!, businessId: p.businessId! },
      { sellerId: body.sellerId, maxMicros: body.maxMicros, ttlSeconds: body.ttlSeconds ?? 300 },
    );
    return c.json({ credential });
  });

  app.post("/v1/credentials/:id/release", agentOnly, async (c) => {
    const p = c.get("principal");
    const row = await sql.begin(async (tx) => {
      const r = await lockCredential(tx, c.req.param("id"));
      if (!r || r.agent_id !== p.agentId) throw new ApiError("not_found", "No such credential");
      if (r.status !== "active") return r; // releasing twice is harmless
      return closeCredential(tx, r, "released");
    });
    return c.json({ credential: credentialJson(row, deps.now()) });
  });

  app.get("/v1/credentials/:id", requireAuth(deps, ["seller", "agent"]), async (c) => {
    const p = c.get("principal");
    const [r] = await sql<CredentialRow[]>`select * from credentials where id = ${c.req.param("id")} and env = ${p.env}`;
    const allowed = r && (p.kind === "seller" ? r.seller_id === p.sellerId : r.agent_id === p.agentId);
    if (!allowed) throw new ApiError("not_found", "No such credential");
    return c.json({ credential: credentialJson(r, deps.now()) });
  });
}
