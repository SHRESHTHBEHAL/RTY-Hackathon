import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { listParams } from "../http.js";
import { serviceJson, type ServiceRow } from "./seller.js";

type SellerRow = { id: string; name: string; seq: bigint };

/** Public seller directory (context.md section 8, M2). Only active services are listed. */
export function registerDirectoryRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const env = "test";

  async function withServices(sellers: SellerRow[]) {
    const ids = sellers.map((s) => s.id);
    const services = ids.length
      ? await sql<ServiceRow[]>`select * from services where seller_id = any(${ids}::text[]) and active order by seq`
      : [];
    return (s: SellerRow) => ({ id: s.id, name: s.name, services: services.filter((x) => x.seller_id === s.id).map(serviceJson) });
  }

  app.get("/v1/sellers", async (c) => {
    const lp = listParams(c);
    const q = (c.req.query("query") ?? "").trim();
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    // Ordered by creation (newest first); the cursor is a row number in that order.
    const rows = await sql<(SellerRow & { rn: bigint })[]>`
      select * from (
        select s.id, s.name, row_number() over (order by s.created_at desc, s.id) as rn
        from sellers s
        where s.env = ${env} and (${q} = '' or s.name ilike ${like}
          or exists (select 1 from services v where v.seller_id = s.id and v.active and v.name ilike ${like}))
      ) t where rn > ${lp.cursor ?? 0n} order by rn limit ${lp.limit + 1}`;
    const map = await withServices(rows);
    const more = rows.length > lp.limit;
    const slice = more ? rows.slice(0, lp.limit) : rows;
    return c.json({ data: slice.map(map), nextCursor: more ? slice[slice.length - 1]!.rn.toString() : null });
  });

  app.get("/v1/sellers/:id", async (c) => {
    const [s] = await sql<SellerRow[]>`select id, name, 0::bigint as seq from sellers where id = ${c.req.param("id")} and env = ${env}`;
    if (!s) throw new ApiError("not_found", "No such seller");
    return c.json({ seller: (await withServices([s]))(s) });
  });
}
