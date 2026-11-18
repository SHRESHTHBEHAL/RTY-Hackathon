"use server";

import { GaitwayError } from "@/lib/api/errors";
import { formatUsd } from "@/lib/format";
import {
  BLOCKED_AMOUNT,
  CENT,
  REFILL,
  RUN_HOLD,
  RUN_MESSAGES,
  client,
  demoKeys,
  demoMode,
  forgetIdentity,
  identity,
  liveBase,
  readSnapshot,
  refusalOf,
  relayUrl,
} from "./server";
import type { DemoResult, DemoSnapshot } from "./types";

/**
 * Server actions behind the presentation screen. A run is split into
 * steps (start, one message per step, end) so the screen can launch each
 * token the moment its charge really happens.
 *
 *  fixtures: the same `api(...)` calls a real agent and seller make:
 *            agent POST /v1/credentials, seller POST /v1/charges once per
 *            message, agent POST /v1/credentials/:id/release.
 *  live:     @gaitway/sdk's GaitwayAgent with a DEMO_AGENT_KEYS key calls
 *            Relay at DEMO_RELAY_URL, paying on its 402, one fetch per step.
 */

type LiveAgent = {
  fetch: (url: string, init?: RequestInit, opts?: { maxMicros?: string }) => Promise<Response>;
  releaseAll: () => Promise<void>;
  createCredential: (input: { sellerId: string; maxMicros: string; ttlSeconds?: number }) => Promise<{ id: string }>;
  release: (id: string) => Promise<unknown>;
};

type Run = {
  slot: number;
  name: string;
  sent: number;
  startedAt: number;
  /** fixtures: the open credential */
  credentialId?: string;
  /** live: the SDK agent, which keeps its own credential with Relay */
  agent?: LiveAgent;
};

const g = globalThis as typeof globalThis & { __gaitwayDemoRuns?: Map<string, Run> };
const runs = (g.__gaitwayDemoRuns ??= new Map());

async function snap(): Promise<DemoSnapshot | null> {
  try {
    return await readSnapshot();
  } catch {
    return null;
  }
}

function fail(e: unknown, snapshot: DemoSnapshot | null): DemoResult<never> {
  return { ok: false, refusal: refusalOf(e), snapshot };
}

function slotOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 2) throw new GaitwayError("validation_failed", "Unknown agent.", 422);
  return n;
}

async function sdkAgent(apiKey: string): Promise<LiveAgent> {
  // Server only: the SDK is imported here and nowhere in browser code.
  const { GaitwayAgent } = await import("@gaitway/sdk");
  return new GaitwayAgent({ apiKey, baseUrl: liveBase(), sessionMicros: RUN_HOLD }) as unknown as LiveAgent;
}

/** Drop runs nobody finished (a closed tab), releasing what they still hold. */
async function sweep() {
  const now = Date.now();
  for (const [id, r] of runs) {
    if (now - r.startedAt < 120_000) continue;
    runs.delete(id);
    await closeRun(r).catch(() => {});
  }
}

async function closeRun(r: Run) {
  if (r.agent) {
    await r.agent.releaseAll();
    return;
  }
  if (r.credentialId) {
    const keys = await demoKeys();
    try {
      await client(keys.agents[r.slot]!).releaseCredential(r.credentialId);
    } catch (e) {
      // Already used up or released: nothing left on hold.
      if (!(e instanceof GaitwayError && (e.code === "credential_not_active" || e.code === "credential_expired"))) throw e;
    }
  }
}

/** Fixture mode, like the SDK: open a hold for what is left of the run, capped to the balance. */
async function openHold(slot: number, messagesLeft: number): Promise<string> {
  const keys = await demoKeys();
  const id = await identity(keys);
  const agentApi = client(keys.agents[slot]!);
  const { wallet } = await agentApi.getWallet();
  const want = BigInt(CENT) * BigInt(messagesLeft);
  const available = BigInt(wallet.availableMicros);
  // An empty wallet still asks for the hold, so the refusal comes from Gaitway itself.
  const max = available > 0n && available < want ? available : want;
  const { credential } = await agentApi.createCredential({ sellerId: id.sellerId, maxMicros: max.toString(), ttlSeconds: 120 });
  return credential.id;
}

export async function startRun(slotArg: number): Promise<DemoResult<{ runId: string; messages: number }>> {
  try {
    const slot = slotOf(slotArg);
    await sweep();
    const keys = await demoKeys();
    const name = (await snap())?.agents[slot]?.name ?? `Agent ${slot + 1}`;
    const run: Run = { slot, name, sent: 0, startedAt: Date.now() };
    if (demoMode() === "live") {
      run.agent = await sdkAgent(keys.agents[slot]!);
    } else {
      run.credentialId = await openHold(slot, RUN_MESSAGES);
    }
    const runId = globalThis.crypto.randomUUID();
    runs.set(runId, run);
    return { ok: true, runId, messages: RUN_MESSAGES, snapshot: await snap() };
  } catch (e) {
    return fail(e, await snap());
  }
}

export async function stepRun(runId: string): Promise<DemoResult<{ chargeId: string; amountMicros: string; done: boolean }>> {
  const run = runs.get(String(runId));
  if (!run) return fail(new GaitwayError("not_found", "This run has ended. Start it again.", 404), await snap());
  const n = run.sent + 1;
  try {
    let chargeId: string;
    let amountMicros = CENT;
    if (run.agent) {
      const res = await run.agent.fetch(
        `${relayUrl()}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: "ops@example.test", text: `Message ${n} from ${run.name}` }),
        },
        { maxMicros: RUN_HOLD },
      );
      if (!res.ok) {
        throw new GaitwayError("relay_refused", `Relay answered HTTP ${res.status}. Nothing more was sent.`, res.status);
      }
      chargeId = `msg_${runId}_${n}`;
    } else {
      const keys = await demoKeys();
      const seller = client(keys.seller);
      const charge = async () =>
        seller.createCharge({ credentialId: run.credentialId!, amountMicros: CENT, description: `Message ${n} from ${run.name}` });
      let out;
      try {
        out = await charge();
      } catch (e) {
        // The hold ran out mid-run: open another, as the SDK does, then charge once more.
        if (e instanceof GaitwayError && (e.code === "credential_not_active" || e.code === "amount_exceeds_remaining")) {
          run.credentialId = await openHold(run.slot, RUN_MESSAGES - run.sent);
          out = await charge();
        } else throw e;
      }
      chargeId = out.charge.id;
      amountMicros = out.charge.amountMicros;
    }
    run.sent = n;
    const done = n >= RUN_MESSAGES;
    if (done) {
      runs.delete(runId);
      await closeRun(run).catch(() => {});
    }
    return { ok: true, chargeId, amountMicros, done, snapshot: await snap() };
  } catch (e) {
    runs.delete(runId);
    await closeRun(run).catch(() => {});
    return fail(e, await snap());
  }
}

/** Stop a run early (reset, or the presenter navigated away) and release its hold. */
export async function endRun(runId: string): Promise<DemoResult> {
  const run = runs.get(String(runId));
  runs.delete(String(runId));
  try {
    if (run) await closeRun(run);
    return { ok: true, snapshot: await snap() };
  } catch (e) {
    return fail(e, await snap());
  }
}

/**
 * The payment that breaks a rule: Scout asks to put $5.00 on hold for Relay
 * against its $2.00 per-payment limit. Gaitway refuses it at
 * POST /v1/credentials with rule_violation, before any money moves.
 */
export async function tryBlocked(slotArg = 0): Promise<DemoResult<{ unexpected: true }>> {
  try {
    const slot = slotOf(slotArg);
    const keys = await demoKeys();
    const id = await identity(keys);
    const before = await snap();
    const cap = before?.agents[slot]?.rules?.perPaymentMaxMicros;
    const name = before?.agents[slot]?.name ?? "The agent";
    try {
      let credentialId: string;
      if (demoMode() === "live") {
        const agent = await sdkAgent(keys.agents[slot]!);
        credentialId = (await agent.createCredential({ sellerId: id.sellerId, maxMicros: BLOCKED_AMOUNT, ttlSeconds: 30 })).id;
        await agent.release(credentialId).catch(() => {});
      } else {
        const agentApi = client(keys.agents[slot]!);
        credentialId = (await agentApi.createCredential({ sellerId: id.sellerId, maxMicros: BLOCKED_AMOUNT, ttlSeconds: 30 })).credential.id;
        await agentApi.releaseCredential(credentialId).catch(() => {});
      }
      // No rule stopped it (the business removed the cap): the hold was released at once.
      return { ok: true, unexpected: true, snapshot: await snap() };
    } catch (e) {
      const r = refusalOf(e);
      if (r.code === "rule_violation" && cap) {
        r.sign = `Over ${formatUsd(cap)} limit`;
        r.message = `${formatUsd(BLOCKED_AMOUNT)} is over ${name}'s ${formatUsd(cap)} per-payment limit. No money moved.`;
      }
      return { ok: false, refusal: r, snapshot: await snap() };
    }
  } catch (e) {
    return fail(e, await snap());
  }
}

/** Add money: move $5.00 from the business's unallocated balance into the wallet, topping up test money first if needed. */
export async function addMoney(slotArg: number): Promise<DemoResult<{ amountMicros: string }>> {
  try {
    const slot = slotOf(slotArg);
    const keys = await demoKeys();
    const id = await identity(keys);
    const biz = client(keys.business);
    const walletId = id.agents[slot]!.walletId;
    const allocate = () => biz.allocate({ walletId, amountMicros: REFILL, direction: "to_wallet" });
    try {
      await allocate();
    } catch (e) {
      if (!(e instanceof GaitwayError && e.code === "insufficient_funds")) throw e;
      await biz.createTopup({ amountMicros: "20000000", method: "test" });
      const until = Date.now() + 12_000;
      for (;;) {
        const { unallocatedMicros } = await biz.getBalance();
        if (BigInt(unallocatedMicros) >= BigInt(REFILL)) break;
        if (Date.now() > until) {
          throw new GaitwayError("topup_pending", "The test top-up has not confirmed yet. Try again in a moment.", 0);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      await allocate();
    }
    return { ok: true, amountMicros: REFILL, snapshot: await snap() };
  } catch (e) {
    return fail(e, await snap());
  }
}

/**
 * Reset. Fixtures: re-seed the in-memory backend (every fixture session,
 * including dashboard logins on this server, starts over). Live: release
 * any open run; balances in the real API are left as they are.
 */
export async function resetDemo(): Promise<DemoResult> {
  try {
    const open = [...runs.values()];
    runs.clear();
    if (demoMode() === "fixtures") {
      const { resetFixtures } = await import("@/lib/api/fixtures");
      resetFixtures();
      forgetIdentity();
    } else {
      await Promise.all(open.map((r) => closeRun(r).catch(() => {})));
    }
    return { ok: true, snapshot: await snap() };
  } catch (e) {
    return fail(e, await snap());
  }
}
