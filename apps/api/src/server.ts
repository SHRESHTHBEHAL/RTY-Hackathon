import { serve } from "@hono/node-server";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSql } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { newState, type Deps } from "./deps.js";
import { getVault } from "./vault/index.js";
import { startJobs } from "./jobs/runner.js";

try {
  process.loadEnvFile();
} catch {
  /* no .env file: rely on the environment */
}

const config = loadConfig();
const sql = createSql(config.databaseUrl, { max: 20 });
await migrate(sql);
const deps: Deps = { sql, config, vault: getVault(config), now: () => new Date(), state: newState() };
const app = buildApp(deps);

const jobs = startJobs(deps);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`gaitway api listening on http://localhost:${info.port} (vault: ${config.vaultDriver})`);
});

const shutdown = async () => {
  jobs?.stop();
  server.close();
  await sql.end({ timeout: 2 });
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
