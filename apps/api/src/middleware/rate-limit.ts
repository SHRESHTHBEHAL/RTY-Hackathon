import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";

const WINDOW_MS = 10_000;

/**
 * Per-credential sliding window: at most `rateLimitPer10s` requests per API key
 * or session token in any 10 seconds, then HTTP 429. In-process only; a
 * multi-instance deployment needs a shared store.
 */
export function rateLimit(deps: Deps): MiddlewareHandler<AppEnv> {
  const hits = new Map<string, number[]>();
  let sweeps = 0;
  return async (c, next) => {
    const m = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "");
    if (m) {
      const key = createHash("sha256").update(m[1]!).digest("base64url");
      const now = deps.now().getTime();
      const list = (hits.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
      if (list.length >= deps.config.rateLimitPer10s) {
        hits.set(key, list);
        c.header("retry-after", String(Math.ceil((list[0]! + WINDOW_MS - now) / 1000)));
        throw new ApiError("rate_limited");
      }
      list.push(now);
      hits.set(key, list);
      if (++sweeps % 1000 === 0) {
        for (const [k, v] of hits) if (v[v.length - 1]! <= now - WINDOW_MS) hits.delete(k);
      }
    }
    await next();
  };
}
