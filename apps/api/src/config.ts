import { z } from "zod";

export type Env = "test" | "live";

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://gaitway:gaitway@localhost:5432/gaitway"),
  GAITWAY_ISSUER: z.string().url().default("http://localhost:8787"),
  PORT: z.coerce.number().int().positive().default(8787),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
  LIVE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  VAULT_DRIVER: z.enum(["memory", "chain"]).default("memory"),
  SETTLE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  RPC_URL: z.string().default("http://localhost:8545"),
  CHAIN_ID: z.coerce.number().int().default(31337),
  VAULT_ADDRESS: z.string().optional(),
  USDC_ADDRESS: z.string().optional(),
  ADMIN_PRIVATE_KEY: z.string().optional(),
  TEST_ADDRESS_MNEMONIC: z.string().optional(),
  CONFIRMATIONS: z.coerce.number().int().min(0).default(1),
  RAMP_PROVIDER: z.enum(["none", "simulated"]).default("none"),
  IDENTITY_PROVIDER: z.enum(["none", "simulated"]).default("none"),
  RATE_LIMIT_PER_10S: z.coerce.number().int().positive().default(100),
  CORS_ORIGINS: z.string().default("*"),
  VAULT_DEPLOY_BLOCK: z.coerce.bigint().default(0n),
});

export type Config = {
  databaseUrl: string;
  issuer: string;
  port: number;
  platformFeeBps: number;
  liveEnabled: boolean;
  vaultDriver: "memory" | "chain";
  settleIntervalSeconds: number;
  sessionSecret: string;
  rpcUrl: string;
  chainId: number;
  vaultAddress?: string;
  usdcAddress?: string;
  adminPrivateKey?: string;
  testAddressMnemonic?: string;
  confirmations: number;
  rampProvider: "none" | "simulated";
  identityProvider: "none" | "simulated";
  /** Requests allowed per API key or session in any 10-second window. */
  rateLimitPer10s: number;
  /** "*" or a comma-separated list of browser origins allowed to call the API. */
  corsOrigins: string;
  /** First block to scan for vault deposits (deployBlock from the deployment file). */
  vaultDeployBlock: bigint;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const p = schema.safeParse(cleaned);
  if (!p.success) {
    throw new Error(`Invalid settings: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const s = p.data;
  return {
    databaseUrl: s.DATABASE_URL,
    issuer: s.GAITWAY_ISSUER.replace(/\/$/, ""),
    port: s.PORT,
    platformFeeBps: s.PLATFORM_FEE_BPS,
    liveEnabled: s.LIVE_ENABLED,
    vaultDriver: s.VAULT_DRIVER,
    settleIntervalSeconds: s.SETTLE_INTERVAL_SECONDS,
    sessionSecret: s.SESSION_SECRET,
    rpcUrl: s.RPC_URL,
    chainId: s.CHAIN_ID,
    vaultAddress: s.VAULT_ADDRESS,
    usdcAddress: s.USDC_ADDRESS,
    adminPrivateKey: s.ADMIN_PRIVATE_KEY,
    testAddressMnemonic: s.TEST_ADDRESS_MNEMONIC,
    confirmations: s.CONFIRMATIONS,
    rampProvider: s.RAMP_PROVIDER,
    identityProvider: s.IDENTITY_PROVIDER,
    rateLimitPer10s: s.RATE_LIMIT_PER_10S,
    corsOrigins: s.CORS_ORIGINS,
    vaultDeployBlock: s.VAULT_DEPLOY_BLOCK,
  };
}
