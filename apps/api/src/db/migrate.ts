import type { Db } from "./client.js";
import { SCHEMA } from "./schema.js";

/** Applies the schema. Idempotent; serialised with an advisory lock. */
export async function migrate(sql: Db): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274)`;
    for (const stmt of SCHEMA) await tx.unsafe(stmt);
  });
}
