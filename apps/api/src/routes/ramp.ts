import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { ApiError } from "../errors.js";
import { requireAuth } from "../auth/middleware.js";

/**
 * POST /v1/verification (not in context.md section 8; an addition for the
 * identity slot): runs the configured identity provider for the calling
 * business. Credentials then carry biz.verified = true.
 */
export function registerVerificationRoutes(app: App, deps: Deps) {
  app.post("/v1/verification", requireAuth(deps, ["business"]), async (c) => {
    const p = c.get("principal");
    if (!deps.identity) throw new ApiError("validation_failed", "No identity provider is configured");
    const r = await deps.identity.verify(p.businessId!);
    await deps.sql`update businesses set verified = ${r.verified}, verifier = ${r.verifier}, verification_id = ${r.verificationId}
                   where id = ${p.businessId!}`;
    return c.json(r);
  });
}
