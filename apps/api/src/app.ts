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

export type AppEnv = { Variables: { principal: Principal } };
export type App = Hono<AppEnv>;

export function buildApp(deps: Deps): App {
  const app: App = new Hono<AppEnv>();
  const log = logOf(deps);

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

  app.get("/health", (c) => c.json({ ok: true }));

  registerAccountRoutes(app, deps);
  registerKeyRoutes(app, deps);
  registerAgentRoutes(app, deps);
  registerFundsRoutes(app, deps);
  registerJwks(app, deps);
  registerCredentialRoutes(app, deps);
  registerChargeRoutes(app, deps);
  registerSellerRoutes(app, deps);
  registerPayoutRoutes(app, deps);

  return app;
}
