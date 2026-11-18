import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { listParams, page, readJson, seqBound } from "../http.js";
import { newId } from "../ids.js";
import { requireAuth } from "../auth/middleware.js";
import { apiKeyJson, createApiKey, type KeyRow } from "../auth/keys.js";
import { agentJson, walletJson, type AgentRow } from "../serialize.js";
import { LabelBody } from "./keys.js";

const CreateAgent = z.object({ name: z.string().trim().min(1).max(200) });
const PatchAgent = z
  .object({ name: z.string().trim().min(1).max(200).optional(), status: z.enum(["active", "disabled"]).optional() })
  .strict();

export function registerAgentRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const biz = requireAuth(deps, ["business"]);

  async function ownAgent(env: string, businessId: string, id: string): Promise<AgentRow> {
    const [a] = await sql<AgentRow[]>`select * from agents where id = ${id} and env = ${env} and business_id = ${businessId}`;
    if (!a) throw new ApiError("not_found", "No such agent");
    return a;
  }

  app.post("/v1/agents", biz, async (c) => {
    const p = c.get("principal");
    const body = await readJson(c, CreateAgent);
    const agentId = newId("agt");
    const walletId = newId("wal");
    const out = await sql.begin(async (tx) => {
      const [a] = await tx<AgentRow[]>`
        insert into agents (id, env, business_id, name, wallet_id) values (${agentId}, ${p.env}, ${p.businessId!}, ${body.name}, ${walletId})
        returning *`;
      await tx`insert into wallets (id, env, agent_id, business_id) values (${walletId}, ${p.env}, ${agentId}, ${p.businessId!})`;
      const { apiKey } = await createApiKey(tx, p.env, "agent", { agentId, businessId: p.businessId }, "default");
      return { a: a!, apiKey };
    });
    return c.json({ agent: agentJson(out.a), apiKey: out.apiKey });
  });

  app.get("/v1/agents", biz, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<AgentRow[]>`
      select * from agents where env = ${p.env} and business_id = ${p.businessId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, agentJson));
  });

  app.get("/v1/agents/:id", biz, async (c) => {
    const p = c.get("principal");
    const a = await ownAgent(p.env, p.businessId!, c.req.param("id"));
    return c.json({ agent: agentJson(a), wallet: await walletJson(sql, p.env, a.wallet_id, a.id) });
  });

  app.patch("/v1/agents/:id", biz, async (c) => {
    const p = c.get("principal");
    const a = await ownAgent(p.env, p.businessId!, c.req.param("id"));
    const body = await readJson(c, PatchAgent);
    const [u] = await sql<AgentRow[]>`
      update agents set name = ${body.name ?? a.name}, status = ${body.status ?? a.status}
      where id = ${a.id} returning *`;
    return c.json({ agent: agentJson(u!) });
  });

  app.get("/v1/agents/:id/keys", biz, async (c) => {
    const p = c.get("principal");
    const a = await ownAgent(p.env, p.businessId!, c.req.param("id"));
    const lp = listParams(c);
    const rows = await sql<KeyRow[]>`
      select * from api_keys where holder_kind = 'agent' and agent_id = ${a.id} and revoked_at is null and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, apiKeyJson));
  });

  app.post("/v1/agents/:id/keys", biz, async (c) => {
    const p = c.get("principal");
    const a = await ownAgent(p.env, p.businessId!, c.req.param("id"));
    const body = await readJson(c, LabelBody);
    return c.json(await createApiKey(sql, p.env, "agent", { agentId: a.id, businessId: a.business_id }, body.label));
  });

  app.delete("/v1/agents/:id/keys/:keyId", biz, async (c) => {
    const p = c.get("principal");
    const a = await ownAgent(p.env, p.businessId!, c.req.param("id"));
    const rows = await sql`
      update api_keys set revoked_at = now()
      where id = ${c.req.param("keyId")} and holder_kind = 'agent' and agent_id = ${a.id} and revoked_at is null
      returning id`;
    if (rows.length === 0) throw new ApiError("not_found");
    return c.json({ ok: true });
  });

  app.get("/v1/wallet", requireAuth(deps, ["agent"]), async (c) => {
    const p = c.get("principal");
    return c.json({ wallet: await walletJson(sql, p.env, p.walletId!, p.agentId!) });
  });
}
