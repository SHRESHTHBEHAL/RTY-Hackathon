"use server";

import { GaitwayError, humanError } from "@/lib/api/errors";
import type { Agent, ApiKey, Mandate, Rules, Topup, Wallet, Withdrawal } from "@/lib/api/types";
import { sessionApi } from "@/lib/session";

/**
 * Every business mutation. Each returns a plain result instead of throwing,
 * so forms can show the message inline next to the field.
 */

export type Fail = { ok: false; code: string; message: string; field?: string };
export type Result<T> = ({ ok: true } & T) | Fail;

const DIGITS = /^\d+$/;

async function run<T>(fn: () => Promise<T>, words: Partial<Record<string, string>> = {}): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, ...data };
  } catch (e) {
    if (e instanceof GaitwayError) {
      const field = typeof e.details?.field === "string" ? e.details.field : undefined;
      return { ok: false, code: e.code, message: words[e.code] ?? humanError(e), field };
    }
    console.error("[business action]", e);
    return { ok: false, code: "unknown", message: "Something went wrong. Try again." };
  }
}

const badAmount: Fail = { ok: false, code: "validation_failed", message: "Enter an amount more than zero, like 25 or 12.50.", field: "amountMicros" };

function amountOk(v: string) {
  return DIGITS.test(v) && BigInt(v) > 0n;
}

/* ---- Agents ---- */

export async function createAgentAction(input: { name: string }): Promise<Result<{ agent: Agent; apiKey: string }>> {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, code: "validation_failed", message: "Give the agent a name, like Scout.", field: "name" };
  if (name.length > 60) return { ok: false, code: "validation_failed", message: "Keep the name under 60 characters.", field: "name" };
  const gw = await sessionApi();
  return run(() => gw.createAgent({ name }));
}

export async function setAgentStatusAction(agentId: string, status: Agent["status"]): Promise<Result<{ agent: Agent }>> {
  const gw = await sessionApi();
  return run(() => gw.updateAgent(agentId, { status }));
}

export async function allocateAction(input: {
  walletId: string;
  amountMicros: string;
  direction: "to_wallet" | "to_unallocated";
}): Promise<Result<{ unallocatedMicros: string; wallet: Wallet }>> {
  if (!amountOk(input.amountMicros)) return badAmount;
  const gw = await sessionApi();
  return run(() => gw.allocate(input), {
    insufficient_funds:
      input.direction === "to_wallet"
        ? "Not enough unallocated balance. Top up first, or add a smaller amount."
        : "Not enough available balance in this pass. Money on hold cannot be taken back.",
  });
}

export async function createAgentKeyAction(agentId: string, label: string): Promise<Result<{ key: ApiKey; apiKey: string }>> {
  const l = (label ?? "").trim();
  if (!l) return { ok: false, code: "validation_failed", message: "Name the key, like Production.", field: "label" };
  const gw = await sessionApi();
  return run(() => gw.createAgentKey(agentId, { label: l }));
}

export async function revokeAgentKeyAction(agentId: string, keyId: string): Promise<Result<{ revoked: true }>> {
  const gw = await sessionApi();
  return run(async () => {
    await gw.deleteAgentKey(agentId, keyId);
    return { revoked: true as const };
  });
}

export async function setRulesAction(agentId: string, rules: Rules): Promise<Result<{ rules: Rules }>> {
  for (const [field, v] of [
    ["perPaymentMaxMicros", rules.perPaymentMaxMicros],
    ["dailyMaxMicros", rules.dailyMaxMicros],
  ] as const) {
    if (v !== null && !amountOk(v)) return { ...badAmount, message: "Enter a limit more than zero, or leave it empty for no limit.", field };
  }
  if (rules.allowedSellerIds && rules.allowedSellerIds.length === 0) {
    return { ok: false, code: "validation_failed", message: "Pick at least one seller, or allow any seller.", field: "allowedSellerIds" };
  }
  const gw = await sessionApi();
  return run(() => gw.setAgentRules(agentId, rules));
}

/* ---- Funds ---- */

export async function topupAction(amountMicros: string): Promise<Result<{ topup: Topup }>> {
  if (!amountOk(amountMicros)) return badAmount;
  const gw = await sessionApi();
  return run(() => gw.createTopup({ amountMicros, method: "test" }));
}

export async function withdrawAction(amountMicros: string): Promise<Result<{ withdrawal: Withdrawal }>> {
  if (!amountOk(amountMicros)) return badAmount;
  const gw = await sessionApi();
  return run(() => gw.createWithdrawal({ amountMicros }), {
    insufficient_funds: "Not enough unallocated balance to withdraw that amount. Take money back from a pass first, or withdraw less.",
  });
}

/* ---- Subscriptions ---- */

export async function revokeMandateAction(mandateId: string): Promise<Result<{ mandate: Mandate }>> {
  const gw = await sessionApi();
  return run(() => gw.revokeMandate(mandateId));
}

/* ---- Settings ---- */

export async function createKeyAction(label: string): Promise<Result<{ key: ApiKey; apiKey: string }>> {
  const l = (label ?? "").trim();
  if (!l) return { ok: false, code: "validation_failed", message: "Name the key, like Production.", field: "label" };
  const gw = await sessionApi();
  return run(() => gw.createKey({ label: l }));
}

export async function revokeKeyAction(keyId: string): Promise<Result<{ revoked: true }>> {
  const gw = await sessionApi();
  return run(async () => {
    await gw.deleteKey(keyId);
    return { revoked: true as const };
  });
}

export async function setPolicyHookAction(url: string): Promise<Result<{ url: string; secret: string }>> {
  const u = (url ?? "").trim();
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" && p.protocol !== "http:") throw new Error();
  } catch {
    return { ok: false, code: "validation_failed", message: "Enter a full web address that starts with https://", field: "url" };
  }
  const gw = await sessionApi();
  return run(() => gw.setPolicyHook({ url: u }));
}

export async function deletePolicyHookAction(): Promise<Result<{ removed: true }>> {
  const gw = await sessionApi();
  return run(async () => {
    await gw.deletePolicyHook();
    return { removed: true as const };
  });
}
