import { Hono } from "hono";
import type { Deps } from "./deps.js";
import { logOf } from "./deps.js";
import { ApiError } from "./errors.js";
import type { Principal } from "./auth/principal.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerFundsRoutes } from "./routes/funds.js";
import { registerJwks } from "./credentials/jwks.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { registerChargeRoutes } from "./routes/charges.js";
import { registerSellerRoutes } from "./routes/seller.js";
import { registerPayoutRoutes } from "./routes/payouts.js";
import { registerRuleRoutes } from "./routes/rules.js";
import { registerMandateRoutes } from "./routes/mandates.js";
import { registerTransferRoutes } from "./routes/transfers.js";
import { registerRefundRoutes } from "./routes/refunds.js";
import { registerWithdrawalRoutes } from "./routes/withdrawals.js";
import { registerDirectoryRoutes } from "./routes/directory.js";
import { registerWebhookRoutes } from "./routes/webhook.js";
import { registerPolicyHookRoutes } from "./routes/policy-hook.js";
import { checkPolicyHook } from "./rules/hook.js";
import { registerVerificationRoutes } from "./routes/ramp.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { registerOpenApi } from "./openapi.js";

export type AppEnv = { Variables: { principal: Principal } };
export type App = Hono<AppEnv>;

export function buildApp(deps: Deps): App {
  const app: App = new Hono<AppEnv>();
  const log = logOf(deps);
  deps.policyHook ??= (env, businessId, event) => checkPolicyHook(deps, env, businessId, event);

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.toBody(), err.status as 400);
    }
    log("unhandled error", { message: err.message, stack: err.stack });
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "No such route" } }, 404));

  // Live keys are refused unless LIVE_ENABLED=true (context.md section 6).
  app.use("*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    if (!deps.config.liveEnabled && /^Bearer\s+gw_live_/i.test(auth)) {
      throw new ApiError("live_disabled");
    }
    await next();
  });

  app.use("*", rateLimit(deps));

  app.get("/health", (c) => c.json({ ok: true }));
  registerOpenApi(app, deps);

  registerAccountRoutes(app, deps);
  registerKeyRoutes(app, deps);
  registerAgentRoutes(app, deps);
  registerFundsRoutes(app, deps);
  registerJwks(app, deps);
  registerCredentialRoutes(app, deps);
  registerChargeRoutes(app, deps);
  registerSellerRoutes(app, deps);
  registerPayoutRoutes(app, deps);
  registerRuleRoutes(app, deps);
  registerMandateRoutes(app, deps);
  registerTransferRoutes(app, deps);
  registerRefundRoutes(app, deps);
  registerWithdrawalRoutes(app, deps);
  registerDirectoryRoutes(app, deps);
  registerWebhookRoutes(app, deps);
  registerPolicyHookRoutes(app, deps);
  registerVerificationRoutes(app, deps);

  return app;
}
