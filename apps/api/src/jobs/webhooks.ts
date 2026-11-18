import { createHmac } from "node:crypto";
import type { Deps } from "../deps.js";
import { logOf } from "../deps.js";
import type { Db, Tx } from "../db/client.js";
import { newId } from "../ids.js";

export type WebhookType = "payout.sent" | "charge.refunded" | "mandate.revoked";
export const MAX_ATTEMPTS = 5;

export const signBody = (raw: string, secret: string) => createHmac("sha256", secret).update(raw).digest("hex");

/** Records an event for the seller's webhook, inside the caller's transaction. No-op without an endpoint. */
export async function enqueueWebhook(tx: Tx | Db, deps: Deps, sellerId: string, type: WebhookType, data: unknown): Promise<void> {
  const [ep] = await tx`select seller_id from webhook_endpoints where seller_id = ${sellerId}`;
  if (!ep) return;
  const id = newId("evt");
  const createdAt = deps.now().toISOString();
  const payload = JSON.stringify({ id, type, createdAt, data });
  await tx`insert into webhook_events (id, seller_id, type, payload, status, attempts, next_attempt_at)
           values (${id}, ${sellerId}, ${type}, ${payload}, 'pending', 0, ${deps.now()})`;
}

/** Delivers due events. Non-2xx or network errors retry with exponential backoff, up to 5 attempts. */
export async function runWebhookJob(deps: Deps, fetchImpl: typeof fetch = fetch): Promise<number> {
  const log = logOf(deps);
  const due = await deps.sql<{ id: string; payload: string; attempts: number; url: string; secret: string }[]>`
    select e.id, e.payload, e.attempts, w.url, w.secret from webhook_events e join webhook_endpoints w on w.seller_id = e.seller_id
    where e.status = 'pending' and e.next_attempt_at <= ${deps.now()} order by e.next_attempt_at limit 50`;
  let delivered = 0;
  for (const ev of due) {
    let ok = false;
    try {
      const res = await fetchImpl(ev.url, {
        method: "POST",
        headers: { "content-type": "application/json", "gaitway-signature": signBody(ev.payload, ev.secret) },
        body: ev.payload,
        signal: AbortSignal.timeout(5000),
      });
      ok = res.status >= 200 && res.status < 300;
    } catch (e) {
      log("webhook delivery failed", { id: ev.id, error: (e as Error).message });
    }
    const attempts = ev.attempts + 1;
    if (ok) {
      delivered++;
      await deps.sql`update webhook_events set status = 'delivered', attempts = ${attempts} where id = ${ev.id}`;
    } else if (attempts >= MAX_ATTEMPTS) {
      await deps.sql`update webhook_events set status = 'failed', attempts = ${attempts} where id = ${ev.id}`;
    } else {
      const next = new Date(deps.now().getTime() + 2 ** attempts * 1000);
      await deps.sql`update webhook_events set attempts = ${attempts}, next_attempt_at = ${next} where id = ${ev.id}`;
    }
  }
  return delivered;
}
