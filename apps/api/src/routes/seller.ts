import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { listParams, page, readJson, seqBound } from "../http.js";
import { newId } from "../ids.js";
import { requireAuth } from "../auth/middleware.js";

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "url must be http or https");
const ServiceBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  priceNote: z.string().max(200),
  url: httpUrl,
});
const PatchService = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    priceNote: z.string().max(200).optional(),
    url: httpUrl.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type ServiceRow = {
  id: string;
  seq: bigint;
  seller_id: string;
  name: string;
  description: string;
  price_note: string;
  url: string;
  active: boolean;
};
export const serviceJson = (s: ServiceRow) => ({
  id: s.id,
  sellerId: s.seller_id,
  name: s.name,
  description: s.description,
  priceNote: s.price_note,
  url: s.url,
  active: s.active,
});

export function registerSellerRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const seller = requireAuth(deps, ["seller"]);

  app.post("/v1/services", seller, async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, ServiceBody);
    const [s] = await sql<ServiceRow[]>`
      insert into services (id, env, seller_id, name, description, price_note, url)
      values (${newId("svc")}, ${p.env}, ${p.sellerId!}, ${b.name}, ${b.description}, ${b.priceNote}, ${b.url})
      returning *`;
    return c.json({ service: serviceJson(s!) });
  });

  app.get("/v1/services", seller, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<ServiceRow[]>`
      select * from services where env = ${p.env} and seller_id = ${p.sellerId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, serviceJson));
  });

  app.patch("/v1/services/:id", seller, async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, PatchService);
    const [cur] = await sql<ServiceRow[]>`
      select * from services where id = ${c.req.param("id")} and env = ${p.env} and seller_id = ${p.sellerId!}`;
    if (!cur) throw new ApiError("not_found", "No such service");
    const [s] = await sql<ServiceRow[]>`
      update services set name = ${b.name ?? cur.name}, description = ${b.description ?? cur.description},
        price_note = ${b.priceNote ?? cur.price_note}, url = ${b.url ?? cur.url}, active = ${b.active ?? cur.active}
      where id = ${cur.id} returning *`;
    return c.json({ service: serviceJson(s!) });
  });

  app.get("/v1/payout-address", seller, async (c) => {
    const p = c.get("principal");
    const [s] = await sql<{ payout_address: string | null }[]>`select payout_address from sellers where id = ${p.sellerId!}`;
    return c.json({ address: s?.payout_address ?? null });
  });

  // M2: re-registers the seller on the vault with the new address, then stores it.
  app.put("/v1/payout-address", seller, async (c) => {
    const p = c.get("principal");
    const b = await readJson(c, z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "address must be a 0x-prefixed 20-byte hex address") }));
    const r = await deps.vault.registerSeller(p.sellerId!, b.address as `0x${string}`);
    await sql`update sellers set payout_address = ${r.payoutAddress} where id = ${p.sellerId!}`;
    return c.json({ address: r.payoutAddress });
  });
}
