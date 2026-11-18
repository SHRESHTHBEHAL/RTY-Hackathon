import { z } from "zod";
import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { readJson } from "../http.js";
import { newId } from "../ids.js";
import { createApiKey, hashPassword, verifyPassword } from "../auth/keys.js";
import { createSessionToken } from "../auth/sessions.js";
import { requireAuth } from "../auth/middleware.js";
import { accountJson, type AccountRow } from "../serialize.js";
import { toChainKey } from "../vault/chainkey.js";

const SignupBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8, "password must be at least 8 characters").max(200),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["business", "seller"]),
});
const LoginBody = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });

export function registerAccountRoutes(app: App, deps: Deps) {
  const { sql } = deps;
  const env = "test" as const; // M1: signups are test-mode only

  app.post("/v1/accounts", async (c) => {
    const body = await readJson(c, SignupBody);
    const email = body.email.toLowerCase();
    const [taken] = await sql`select 1 from accounts where lower(email) = ${email}`;
    if (taken) throw new ApiError("validation_failed", "An account with this email already exists", { field: "email" });

    const accountId = newId("acc");
    const passwordHash = await hashPassword(body.password);
    const businessId = body.kind === "business" ? newId("biz") : null;
    const sellerId = body.kind === "seller" ? newId("sel") : null;

    // Register on the vault first; a failed DB insert afterwards leaves only a harmless unused registration.
    let address: string;
    if (businessId) address = (await deps.vault.registerBusiness(businessId)).withdrawAddress;
    else address = (await deps.vault.registerSeller(sellerId!)).payoutAddress;

    try {
      const out = await sql.begin(async (tx) => {
        const [acc] = await tx<AccountRow[]>`
          insert into accounts (id, env, email, name, kind, password_hash, business_id, seller_id)
          values (${accountId}, ${env}, ${email}, ${body.name}, ${body.kind}, ${passwordHash}, ${businessId}, ${sellerId})
          returning *`;
        if (businessId) {
          await tx`insert into businesses (id, env, name, account_id, chain_key, withdraw_address)
                   values (${businessId}, ${env}, ${body.name}, ${accountId}, ${toChainKey(businessId)}, ${address})`;
        } else {
          await tx`insert into sellers (id, env, name, account_id, chain_key, payout_address)
                   values (${sellerId}, ${env}, ${body.name}, ${accountId}, ${toChainKey(sellerId!)}, ${address})`;
        }
        const { apiKey } = await createApiKey(tx, env, body.kind, { businessId, sellerId }, "default");
        return { acc: acc!, apiKey };
      });
      return c.json({
        account: accountJson(out.acc),
        sessionToken: createSessionToken(accountId, deps.config.sessionSecret, deps.now()),
        apiKey: out.apiKey,
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        throw new ApiError("validation_failed", "An account with this email already exists", { field: "email" });
      }
      throw e;
    }
  });

  app.post("/v1/sessions", async (c) => {
    const body = await readJson(c, LoginBody);
    const [acc] = await sql<(AccountRow & { password_hash: string })[]>`
      select * from accounts where lower(email) = ${body.email.toLowerCase()}`;
    if (!acc || !(await verifyPassword(body.password, acc.password_hash))) {
      throw new ApiError("unauthorized", "Wrong email or password");
    }
    return c.json({
      account: accountJson(acc),
      sessionToken: createSessionToken(acc.id, deps.config.sessionSecret, deps.now()),
    });
  });

  app.get("/v1/me", requireAuth(deps, ["business", "seller", "agent"]), async (c) => {
    const p = c.get("principal");
    // An agent key has no account of its own; it reports its business's account.
    const [acc] = p.accountId
      ? await sql<AccountRow[]>`select * from accounts where id = ${p.accountId}`
      : await sql<AccountRow[]>`select * from accounts where business_id = ${p.businessId ?? null}`;
    if (!acc) throw new ApiError("not_found");
    return c.json({ account: accountJson(acc) });
  });
}
