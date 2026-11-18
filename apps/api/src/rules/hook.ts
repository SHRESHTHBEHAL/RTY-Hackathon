import { z } from "zod";
import type { Deps, PolicyEvent } from "../deps.js";
import { ApiError } from "../errors.js";
import { newId } from "../ids.js";
import { signBody } from "../jobs/webhooks.js";

const Reply = z.object({
  outcome: z.enum(["allow", "hold", "block"]),
  reasons: z.array(z.string()).default([]),
  approvalLink: z.string().nullable().default(null),
});

const refuse = (message: string, outcome: "hold" | "block", approvalLink: string | null) =>
  new ApiError("rule_violation", message, { outcome, approvalLink });

/**
 * Calls the business's policy hook (context.md section 8, M2). Must be called
 * outside any database transaction. Anything but a valid "allow" within
 * 2 seconds refuses with rule_violation. A hook that cannot be reached or
 * answers badly is reported with outcome "block".
 */
export async function checkPolicyHook(deps: Deps, env: "test" | "live", businessId: string, event: PolicyEvent): Promise<void> {
  const [h] = await deps.sql<{ url: string; secret: string }[]>`select url, secret from policy_hooks where business_id = ${businessId} and env = ${env}`;
  if (!h) return;
  const raw = JSON.stringify({
    id: newId("evt"),
    type: event.type,
    agentId: event.agentId,
    walletId: event.walletId,
    sellerId: event.sellerId,
    amountMicros: event.amountMicros.toString(),
    createdAt: deps.now().toISOString(),
  });
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(h.url, {
      method: "POST",
      headers: { "content-type": "application/json", "gaitway-signature": signBody(raw, h.secret) },
      body: raw,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    throw refuse("The business's policy hook did not answer in time", "block", null);
  }
  if (res.status !== 200) throw refuse(`The business's policy hook answered HTTP ${res.status}`, "block", null);
  let parsed: z.infer<typeof Reply>;
  try {
    parsed = Reply.parse(await res.json());
  } catch {
    throw refuse("The business's policy hook gave an invalid answer", "block", null);
  }
  if (parsed.outcome !== "allow") {
    throw refuse(parsed.reasons.length ? parsed.reasons.join("; ") : `Policy hook answered ${parsed.outcome}`, parsed.outcome, parsed.approvalLink);
  }
}
