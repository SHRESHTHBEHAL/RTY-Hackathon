import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Env } from "../config.js";
import type { Db, Tx } from "../db/client.js";
import { newId, randomBase36 } from "../ids.js";
import { iso } from "../http.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type KeyHolder = "business" | "seller" | "agent";
const SHORT: Record<KeyHolder, string> = { business: "biz", seller: "sel", agent: "agt" };

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Creates and stores a key; returns the plaintext once. */
export async function createApiKey(
  db: Db | Tx,
  env: Env,
  holder: KeyHolder,
  owner: { businessId?: string | null; sellerId?: string | null; agentId?: string | null },
  label: string,
) {
  const apiKey = `gw_${env}_${SHORT[holder]}_${randomBase36(32)}`;
  const id = newId("key");
  const [row] = await db<KeyRow[]>`
    insert into api_keys (id, env, holder_kind, business_id, seller_id, agent_id, label, key_hash, last_four)
    values (${id}, ${env}, ${holder}, ${owner.businessId ?? null}, ${owner.sellerId ?? null}, ${owner.agentId ?? null},
            ${label}, ${hashKey(apiKey)}, ${apiKey.slice(-4)})
    returning *`;
  return { key: apiKeyJson(row!), apiKey };
}

export type KeyRow = {
  id: string;
  seq: bigint;
  env: Env;
  holder_kind: KeyHolder;
  business_id: string | null;
  seller_id: string | null;
  agent_id: string | null;
  label: string;
  last_four: string;
  created_at: Date;
  revoked_at: Date | null;
};

export const apiKeyJson = (r: KeyRow) => ({ id: r.id, label: r.label, lastFour: r.last_four, createdAt: iso(r.created_at) });

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = await scrypt(pw, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, got);
}
