import type { Ctx } from "./helpers.js";
import { runDepositJob } from "../src/jobs/deposits.js";
import type { MemoryVault } from "../src/vault/memory.js";

export const DOLLAR = 1_000_000n;
export const usd = (n: number) => (BigInt(n) * DOLLAR).toString();

export async function signup(ctx: Ctx, email: string, kind: "business" | "seller" = "business", name = "Acme") {
  const r = await ctx.call("POST", "/v1/accounts", { body: { email, password: "password1", name, kind } });
  if (r.status !== 200) throw new Error(`signup failed: ${r.text}`);
  return r.body as { account: any; sessionToken: string; apiKey: string };
}

export async function confirmDeposits(ctx: Ctx) {
  (ctx.vault as MemoryVault).mineBlocks(1);
  return runDepositJob(ctx.deps);
}

/** Business with `topup` dollars confirmed and unallocated. */
export async function fundedBusiness(ctx: Ctx, email = "biz@x.test", topup = 100) {
  const b = await signup(ctx, email);
  const t = await ctx.call("POST", "/v1/topups", { token: b.apiKey, body: { amountMicros: usd(topup), method: "test" } });
  if (t.status !== 200) throw new Error(t.text);
  await confirmDeposits(ctx);
  return b;
}

export async function createAgent(ctx: Ctx, bizKey: string, name = "Agent") {
  const r = await ctx.call("POST", "/v1/agents", { token: bizKey, body: { name } });
  if (r.status !== 200) throw new Error(r.text);
  return r.body as { agent: { id: string; walletId: string; name: string }; apiKey: string };
}

export async function allocate(ctx: Ctx, bizKey: string, walletId: string, dollars: number) {
  const r = await ctx.call("POST", "/v1/allocations", {
    token: bizKey,
    body: { walletId, amountMicros: usd(dollars), direction: "to_wallet" },
  });
  if (r.status !== 200) throw new Error(r.text);
  return r.body;
}

/** Business + one agent holding `dollars` + one seller. */
export async function world(ctx: Ctx, dollars = 30) {
  const b = await fundedBusiness(ctx);
  const a = await createAgent(ctx, b.apiKey);
  if (dollars > 0) await allocate(ctx, b.apiKey, a.agent.walletId, dollars);
  const s = await signup(ctx, "relay@x.test", "seller", "Relay");
  return { biz: b, agent: a, seller: s, sellerId: s.account.sellerId as string };
}

export async function wallet(ctx: Ctx, agentKey: string) {
  return (await ctx.call("GET", "/v1/wallet", { token: agentKey })).body.wallet as {
    availableMicros: string;
    heldMicros: string;
  };
}
