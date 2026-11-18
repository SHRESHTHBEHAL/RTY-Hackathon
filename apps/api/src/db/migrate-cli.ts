import { loadConfig } from "../config.js";
import { createSql } from "./client.js";
import { migrate } from "./migrate.js";

try {
  process.loadEnvFile();
} catch {
  /* no .env */
}
const config = loadConfig();
const sql = createSql(config.databaseUrl, { max: 1 });
await migrate(sql);
await sql.end();
console.log("migrated");
