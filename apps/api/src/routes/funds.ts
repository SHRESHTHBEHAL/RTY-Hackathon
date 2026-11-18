import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { iso, listParams, page, readJson, seqBound } from "../http.js";
import { newId } from "../ids.js";
import { zMicros } from "../money.js";
import { requireAuth } from "../auth/middleware.js";
import { balanceOf, post } from "../ledger/ledger.js";
import { acct } from "../ledger/accounts.js";
import { walletJson, walletsJson } from "../serialize.js";

const TopupBody = z.object({ amountMicros: zMicros, method: z.enum(["test", "ramp"]) });
const AllocationBody = z.object({
  walletId: z.string().min(1),
  amountMicros: zMicros,
  direction: z.enum(["to_wallet", "to_unallocated"]),
});

type TopupRow = {
  id: string;
  seq: bigint;
  amount_micros: bigint;
  method: "test" | "ramp";
  status: "pending" | "confirmed" | "failed";
  tx_hash: string | null;
  created_at: Date;
};
const topupJson = (t: TopupRow) => ({
  id: t.id,
  amountMicros: t.amount_micros.toString(),
  method: t.method,
  status: t.status,
  txHash: t.tx_hash,
  createdAt: iso(t.created_at),
});

type PostingRow = {
  id: string;
  seq: bigint;
  type: string;
  wallet_id: string | null;
  amount_micros: bigint | null;
  counterparty: string | null;
  created_at: Date;
};
const TX_TYPES = ["topup", "allocation", "hold", "release", "charge", "refund", "withdrawal"];

export function registerFundsRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const biz = requireAuth(deps, ["business"]);

  app.get("/v1/balance", biz, async (c) => {
    const p = c.get("principal");
    const agents = await sql<{ id: string; wallet_id: string }[]>`
      select id, wallet_id from agents where env = ${p.env} and business_id = ${p.businessId!} order by seq desc`;
    return c.json({
      unallocatedMicros: (await balanceOf(sql, p.env, "unallocated", p.businessId!)).toString(),
      wallets: await walletsJson(sql, p.env, agents.map((a) => ({ walletId: a.wallet_id, agentId: a.id }))),
    });
  });

  app.post("/v1/topups", biz, async (c) => {
    const p = c.get("principal");
    const body = await readJson(c, TopupBody);
    if (body.method === "ramp") {
      if (!deps.ramp) throw new ApiError("validation_failed", "method \"ramp\" is not available: no currency partner is configured", { field: "method" });
      const id = newId("top");
      const [row] = await sql<TopupRow[]>`
        insert into topups (id, env, business_id, amount_micros, method, status)
        values (${id}, ${p.env}, ${p.businessId!}, ${body.amountMicros}, 'ramp', 'pending') returning *`;
      try {
        const r = await deps.ramp.createTopup(p.businessId!, body.amountMicros);
        await sql`update topups set provider_ref = ${r.providerRef} where id = ${id}`;
      } catch (e) {
        await sql`update topups set status = 'failed' where id = ${id}`;
        throw e;
      }
      return c.json({ topup: topupJson(row!) });
    }
    if (p.env !== "test") throw new ApiError("validation_failed", "method \"test\" is only allowed in the test environment");
    const id = newId("top");
    const [row] = await sql<TopupRow[]>`
      insert into topups (id, env, business_id, amount_micros, method, status)
      values (${id}, ${p.env}, ${p.businessId!}, ${body.amountMicros}, 'test', 'pending') returning *`;
    try {
      await deps.vault.testDeposit(p.businessId!, body.amountMicros);
    } catch (e) {
      await sql`update topups set status = 'failed' where id = ${id}`;
      throw e;
    }
    return c.json({ topup: topupJson(row!) });
  });

  app.get("/v1/topups", biz, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const rows = await sql<TopupRow[]>`
      select * from topups where env = ${p.env} and business_id = ${p.businessId!} and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(page(rows, lp.limit, topupJson));
  });

  app.post("/v1/allocations", biz, async (c) => {
    const p = c.get("principal");
    const body = await readJson(c, AllocationBody);
    const [w] = await sql<{ id: string; agent_id: string }[]>`
      select id, agent_id from wallets where id = ${body.walletId} and env = ${p.env} and business_id = ${p.businessId!}`;
    if (!w) throw new ApiError("not_found", "No such wallet");
    const toWallet = body.direction === "to_wallet";
    const amt = body.amountMicros;
    const out = await sql.begin(async (tx) => {
      await post(
        tx,
        p.env,
        "allocation",
        w.id,
        [
          { account: acct.unallocated(p.businessId!), deltaMicros: toWallet ? -amt : amt },
          { account: acct.available(w.id), deltaMicros: toWallet ? amt : -amt },
        ],
        { businessId: p.businessId!, walletId: w.id, amountMicros: toWallet ? amt : -amt },
      );
      return {
        unallocatedMicros: (await balanceOf(tx, p.env, "unallocated", p.businessId!)).toString(),
        wallet: await walletJson(tx, p.env, w.id, w.agent_id),
      };
    });
    return c.json(out);
  });

  app.get("/v1/transactions", biz, async (c) => {
    const p = c.get("principal");
    const lp = listParams(c);
    const walletId = c.req.query("walletId");
    if (walletId) {
      const [w] = await sql`select 1 from wallets where id = ${walletId} and env = ${p.env} and business_id = ${p.businessId!}`;
      if (!w) throw new ApiError("not_found", "No such wallet");
    }
    const rows = await sql<PostingRow[]>`
      select id, seq, type, wallet_id, amount_micros, counterparty, created_at from postings
      where env = ${p.env} and business_id = ${p.businessId!} and type = any(${TX_TYPES}::text[])
        ${walletId ? sql`and wallet_id = ${walletId}` : sql``}
        and seq < ${seqBound(lp)}
      order by seq desc limit ${lp.limit + 1}`;
    return c.json(
      page(rows, lp.limit, (r) => ({
        id: r.id,
        type: r.type,
        walletId: r.wallet_id,
        amountMicros: (r.amount_micros ?? 0n).toString(),
        counterparty: r.counterparty,
        createdAt: iso(r.created_at),
      })),
    );
  });
}
