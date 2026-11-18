import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { Deps } from "./deps.js";
import type { Tx } from "./db/client.js";
import { ApiError } from "./errors.js";

/**
 * Runs `handler` at most once per (scope, Idempotency-Key). The key row is
 * inserted in the same transaction as the handler's work, so a concurrent
 * duplicate waits on the unique index and then replays the stored reply
 * byte for byte. Errors roll everything back, so a failed request can be
 * retried with the same key. A different body under the same key is
 * idempotency_conflict.
 */
export async function withIdempotency(
  c: Context,
  deps: Deps,
  scope: string,
  handler: (tx: Tx) => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const key = c.req.header("idempotency-key");
  if (!key || key.length > 255) throw new ApiError("validation_failed", "An Idempotency-Key header (up to 255 characters) is required");
  const raw = await c.req.text();
  const hash = createHash("sha256").update(raw).digest("hex");

  const out = await deps.sql.begin(async (tx) => {
    const ins = await tx`
      insert into idempotency_keys (scope, key, request_hash) values (${scope}, ${key}, ${hash})
      on conflict do nothing returning key`;
    if (ins.length === 0) {
      const [row] = await tx<{ request_hash: string; status_code: number; response_body: string }[]>`
        select request_hash, status_code, response_body from idempotency_keys where scope = ${scope} and key = ${key}`;
      if (!row || row.request_hash !== hash) throw new ApiError("idempotency_conflict");
      return { status: row.status_code, text: row.response_body };
    }
    const r = await handler(tx);
    const text = JSON.stringify(r.body);
    await tx`update idempotency_keys set status_code = ${r.status}, response_body = ${text} where scope = ${scope} and key = ${key}`;
    return { status: r.status, text };
  });
  return new Response(out.text, { status: out.status, headers: { "content-type": "application/json" } });
}
