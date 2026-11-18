import { afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { createSql, type Db } from "../src/db/client.js";
import { createMemoryVault } from "../src/vault/memory.js";
import { loadConfig, type Config } from "../src/config.js";
import { newState, type Deps } from "../src/deps.js";
import { TEST_DATABASE_URL } from "./env.js";

let shared: Db | null = null;
export function testSql(): Db {
  if (!shared) shared = createSql(TEST_DATABASE_URL, { max: 30 });
  return shared;
}
afterAll(async () => {
  if (shared) {
    await shared.end();
    shared = null;
  }
});

export async function resetDb(sql: Db) {
  const rows = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
  if (rows.length === 0) return;
  await sql.unsafe(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
}

export function makeClock(start = Date.now()) {
  let t = start;
  return {
    now: () => new Date(t),
    advance(ms: number) {
      t += ms;
    },
  };
}

export type CallResult = { status: number; body: any; text: string; headers: Headers };

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    ...loadConfig({
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "test-secret-test-secret-test-secret",
      PLATFORM_FEE_BPS: "0",
      LIVE_ENABLED: "false",
      VAULT_DRIVER: "memory",
    }),
    ...over,
  };
}

export async function setup(opts: { feeBps?: number; config?: Partial<Config>; reset?: boolean } = {}) {
  const sql = testSql();
  if (opts.reset !== false) await resetDb(sql);
  const clock = makeClock();
  const vault = createMemoryVault({ confirmations: 1 });
  const config = testConfig({ platformFeeBps: opts.feeBps ?? 0, ...opts.config });
  const deps: Deps = { sql, config, vault, now: clock.now, state: newState() };
  const app = buildApp(deps);
  async function call(
    method: string,
    path: string,
    o: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {},
  ): Promise<CallResult> {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    let body: string | undefined;
    if (o.raw !== undefined) body = o.raw;
    else if (o.body !== undefined) body = JSON.stringify(o.body);
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await app.request(path, { method, headers, body });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, text, headers: res.headers };
  }
  return { app, deps, sql, vault, clock, call, config };
}

export type Ctx = Awaited<ReturnType<typeof setup>>;
