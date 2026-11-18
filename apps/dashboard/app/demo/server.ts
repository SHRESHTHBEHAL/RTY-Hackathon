import "server-only";
import { api, apiMode, type GaitwayApi } from "@/lib/api/client";
import { GaitwayError } from "@/lib/api/errors";
import type { Charge, Payout, Rules, Transaction } from "@/lib/api/types";
import type { DemoAgent, DemoFeedItem, DemoSnapshot } from "./types";

/**
 * Server side of the presentation screen. Every key used here stays on the
 * server: fixture mode reads the fixture seed's keys, live mode reads
 * DEMO_BUSINESS_KEY, DEMO_SELLER_KEY and DEMO_AGENT_KEYS (context.md section 10).
 * The browser only ever sees the snapshot below.
 */

export const NAMES = ["Scout", "Buyer", "Broke"] as const;
export const CENT = "10000";
/** Five one-cent messages per run, so the hold is exactly what the run spends. */
export const RUN_MESSAGES = 5;
export const RUN_HOLD = "50000";
export const BLOCKED_AMOUNT = "5000000"; // $5
export const PER_PAYMENT_CAP = "2000000"; // $2
export const REFILL = "5000000"; // $5 per "Add money"

/** The rules each demo agent carries, so the blocked payment has a real cause. */
export const DEMO_RULES: Rules[] = [
  { perPaymentMaxMicros: PER_PAYMENT_CAP, dailyMaxMicros: null, allowedSellerIds: null },
  { perPaymentMaxMicros: PER_PAYMENT_CAP, dailyMaxMicros: "5000000", allowedSellerIds: null },
  { perPaymentMaxMicros: PER_PAYMENT_CAP, dailyMaxMicros: null, allowedSellerIds: null },
];

export type DemoKeys = { business: string; seller: string; agents: string[] };

export function demoMode() {
  return apiMode();
}

export function liveBase(): string {
  return (process.env.GAITWAY_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787").replace(/\/+$/, "");
}

export function relayUrl(): string {
  return (process.env.DEMO_RELAY_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

export class DemoConfigError extends Error {}

export async function demoKeys(): Promise<DemoKeys> {
  if (demoMode() === "fixtures") {
    const { fixtureSeedInfo } = await import("@/lib/api/fixtures");
    const k = fixtureSeedInfo().keys;
    return { business: k.business, seller: k.seller, agents: k.agents };
  }
  const business = process.env.DEMO_BUSINESS_KEY?.trim();
  const seller = process.env.DEMO_SELLER_KEY?.trim();
  const agents = (process.env.DEMO_AGENT_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!business || !seller || agents.length < 3) {
    throw new DemoConfigError(
      "Live mode needs DEMO_BUSINESS_KEY, DEMO_SELLER_KEY and three DEMO_AGENT_KEYS. Set them from the API's demo seed and restart.",
    );
  }
  return { business, seller, agents: agents.slice(0, 3) };
}

/** The dashboard client, bound to a key, in the current mode. */
export function client(key: string): GaitwayApi {
  return demoMode() === "live" ? api(key, { mode: "live", baseUrl: liveBase(), timeoutMs: 6000 }) : api(key);
}

/* ------------------------------------------------------------------ */
/* Identity: which agent, wallet and seller each key belongs to.       */
/* ------------------------------------------------------------------ */

type Identity = {
  businessName: string;
  sellerId: string;
  sellerName: string;
  agents: Array<{ agentId: string; walletId: string }>;
};

const g = globalThis as typeof globalThis & { __gaitwayDemoIdentity?: { key: string; value: Identity } };

export async function identity(keys: DemoKeys): Promise<Identity> {
  const cacheKey = [keys.business, keys.seller, ...keys.agents].join("|");
  if (g.__gaitwayDemoIdentity?.key === cacheKey) return g.__gaitwayDemoIdentity.value;
  const [biz, sel, ...wallets] = await Promise.all([
    client(keys.business).getMe(),
    client(keys.seller).getMe(),
    ...keys.agents.map((k) => client(k).getWallet()),
  ]);
  const value: Identity = {
    businessName: biz.account.name,
    sellerId: sel.account.sellerId ?? "",
    sellerName: sel.account.name,
    agents: wallets.map((w) => ({ agentId: w.wallet.agentId, walletId: w.wallet.walletId })),
  };
  g.__gaitwayDemoIdentity = { key: cacheKey, value };
  return value;
}

export function forgetIdentity() {
  g.__gaitwayDemoIdentity = undefined;
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

const same = (a: Rules, b: Rules) =>
  a.perPaymentMaxMicros === b.perPaymentMaxMicros &&
  a.dailyMaxMicros === b.dailyMaxMicros &&
  JSON.stringify(a.allowedSellerIds) === JSON.stringify(b.allowedSellerIds);

/**
 * Reads each agent's rules and, where the per-payment cap is missing, sets
 * the demo rules through PUT /v1/agents/:id/rules. A business that already
 * set its own cap keeps it.
 */
export async function ensureRules(biz: GaitwayApi, agentIds: string[]): Promise<Rules[]> {
  return Promise.all(
    agentIds.map(async (id, i) => {
      const { rules } = await biz.getAgentRules(id);
      const want = DEMO_RULES[i]!;
      if (rules.perPaymentMaxMicros === null && !same(rules, want)) {
        return (await biz.setAgentRules(id, want)).rules;
      }
      return rules;
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export async function readSnapshot(): Promise<DemoSnapshot> {
  const keys = await demoKeys();
  const id = await identity(keys);
  const biz = client(keys.business);
  const sel = client(keys.seller);
  const agentIds = id.agents.map((a) => a.agentId);

  const [agents, balance, txs, rules, sb, charges, payouts, services] = await Promise.all([
    Promise.all(agentIds.map((a) => biz.getAgent(a))),
    biz.getBalance(),
    biz.listTransactions({ limit: 40 }),
    ensureRules(biz, agentIds),
    sel.getSellerBalance(),
    sel.listCharges({ limit: 12 }),
    sel.listPayouts({ limit: 4 }),
    sel.listServices({ limit: 10 }),
  ]);
  const serverTime = Date.now();

  const byWallet = new Map(agents.map((a) => [a.agent.walletId, a.agent]));
  const byAgent = new Map(agents.map((a) => [a.agent.id, a.agent]));

  const demoAgents: DemoAgent[] = agents.map(({ agent, wallet }, i) => {
    const w = balance.wallets.find((x) => x.walletId === agent.walletId) ?? wallet;
    return {
      slot: i,
      id: agent.id,
      name: agent.name,
      walletId: agent.walletId,
      status: agent.status,
      availableMicros: w.availableMicros,
      heldMicros: w.heldMicros,
      rules: rules[i] ?? null,
    };
  });

  const feed: DemoFeedItem[] = txs.data.map((t: Transaction) => {
      const agent = t.walletId ? byWallet.get(t.walletId) : undefined;
      return {
        id: t.id,
        kind: t.type,
        agentId: agent?.id ?? null,
        agentName: agent?.name ?? null,
        amountMicros: t.amountMicros,
        counterparty: t.counterparty,
        createdAt: t.createdAt,
      };
    });

  return {
    serverTime,
    mode: demoMode(),
    businessName: id.businessName,
    unallocatedMicros: balance.unallocatedMicros,
    agents: demoAgents,
    seller: {
      id: id.sellerId,
      name: id.sellerName,
      owedMicros: sb.owedMicros,
      paidOutMicros: sb.paidOutMicros,
      priceNote: services.data.find((x) => x.active)?.priceNote ?? null,
    },
    charges: charges.data.map((c: Charge) => ({
      id: c.id,
      agentId: c.agentId,
      agentName: byAgent.get(c.agentId)?.name ?? null,
      amountMicros: c.amountMicros,
      description: c.description,
      createdAt: c.createdAt,
    })),
    payouts: payouts.data.map((p: Payout) => ({
      id: p.id,
      amountMicros: p.amountMicros,
      status: p.status,
      createdAt: p.createdAt,
    })),
    feed,
  };
}

/** Plain words for a refusal, per DESIGN.md voice. Short enough for the gate sign. */
export function refusalOf(e: unknown): { code: string; sign: string; message: string } {
  if (e instanceof GaitwayError || (e && typeof e === "object" && "code" in e)) {
    const code = String((e as { code: unknown }).code);
    const msg = String((e as { message?: unknown }).message ?? "");
    switch (code) {
      case "insufficient_funds":
        return { code, sign: "Not enough balance", message: "Not enough balance. The wallet cannot cover the hold, so nothing was sent or charged." };
      case "rule_violation":
        return { code, sign: "Over the limit", message: msg || "A spending rule blocked this payment." };
      case "credential_expired":
        return { code, sign: "Session expired", message: "The payment session expired before the charge." };
      case "credential_not_active":
        return { code, sign: "Session closed", message: "The payment session was already used up or released." };
      case "amount_exceeds_remaining":
        return { code, sign: "Hold used up", message: "The charge is larger than what is left on hold." };
      case "payment_failed":
        return { code, sign: "Payment failed", message: "The seller still asked for payment after Gaitway paid. The agent stopped." };
      case "forbidden":
        return { code, sign: "Not allowed", message: msg || "This agent cannot pay right now." };
      case "network_error":
      case "timeout":
        return { code, sign: "No answer", message: "Gaitway did not answer. Check the API, then try again." };
      default:
        return { code, sign: "Refused", message: msg || "The payment was refused." };
    }
  }
  return { code: "error", sign: "Refused", message: "Something went wrong. Try again." };
}
