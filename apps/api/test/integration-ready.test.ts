import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";
import { fundedBusiness } from "./fixtures.js";
import { runReconcile } from "../src/jobs/reconcile.js";
import { getVault } from "../src/vault/index.js";
import type { MemoryVault } from "../src/vault/memory.js";

describe("CORS for the dashboard", () => {
  it("answers preflight and tags responses", async () => {
    const ctx = await setup();
    const pre = await ctx.app.request("/v1/agents", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      },
    });
    expect(pre.status).toBeLessThan(300);
    expect(pre.headers.get("access-control-allow-origin")).toBeTruthy();
    expect((pre.headers.get("access-control-allow-headers") ?? "").toLowerCase()).toContain("idempotency-key");
    const get = await ctx.app.request("/health", { headers: { origin: "http://localhost:3000" } });
    expect(get.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});

describe("reconciliation pausing", () => {
  it("extra money in the vault (a deposit not yet credited) is reported but does not pause settlement", async () => {
    const ctx = await setup();
    const b = await fundedBusiness(ctx, "b@x.test", 10);
    (ctx.vault as MemoryVault).setBusinessBalance(b.account.businessId, 11_000_000n);
    const r = await runReconcile(ctx.deps);
    expect(r.ok).toBe(false);
    expect(ctx.deps.state.settlementPaused).toBe(false);
  });
});

describe("chain driver", () => {
  it("explains what is missing instead of failing obscurely", async () => {
    const ctx = await setup();
    await expect(getVault({ ...ctx.config, vaultDriver: "chain" })).rejects.toThrow(/VAULT_ADDRESS/);
    await expect(
      getVault({
        ...ctx.config,
        vaultDriver: "chain",
        vaultAddress: "0x" + "1".repeat(40),
        usdcAddress: "0x" + "2".repeat(40),
        adminPrivateKey: "0x" + "3".repeat(64),
      }),
    ).rejects.toThrow(/@gaitway\/chain/);
  });
});
