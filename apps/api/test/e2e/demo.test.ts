import { describe, expect, it } from "vitest";
import { setup } from "../helpers.js";
import { runDepositJob } from "../../src/jobs/deposits.js";
import { runSettlement } from "../../src/jobs/settlement.js";
import { runReconcile } from "../../src/jobs/reconcile.js";
import type { MemoryVault } from "../../src/vault/memory.js";

// The six demo steps of context.md section 11, over HTTP only. The background
// jobs (deposit credit, settlement, reconciliation) are run by hand here.
describe("M1 demo, end to end", () => {
  it("runs the whole demo", async () => {
    const ctx = await setup();
    const { call } = ctx;
    const vault = ctx.vault as MemoryVault;

    // 1. Business signs up, creates three agents, tops up 100 test dollars, funds wallets differently.
    const biz = (await call("POST", "/v1/accounts", { body: { email: "demo@gaitway.test", password: "password1", name: "Demo Co", kind: "business" } })).body;
    const bk = biz.apiKey;
    const agents = [];
    for (const name of ["Atlas", "Beacon", "Comet"]) agents.push((await call("POST", "/v1/agents", { token: bk, body: { name } })).body);
    const top = await call("POST", "/v1/topups", { token: bk, body: { amountMicros: "100000000", method: "test" } });
    expect(top.body.topup.status).toBe("pending");
    vault.mineBlocks(1);
    await runDepositJob(ctx.deps);
    expect((await call("GET", "/v1/topups", { token: bk })).body.data[0].status).toBe("confirmed");
    const amounts = ["50000000", "30000000"];
    for (let i = 0; i < 2; i++) {
      const r = await call("POST", "/v1/allocations", { token: bk, body: { walletId: agents[i].agent.walletId, amountMicros: amounts[i], direction: "to_wallet" } });
      expect(r.status).toBe(200);
    }
    const bal = (await call("GET", "/v1/balance", { token: bk })).body;
    expect(bal.unallocatedMicros).toBe("20000000");
    expect(bal.wallets.map((w: any) => w.availableMicros).sort()).toEqual(["0", "30000000", "50000000"]);

    // 2. Seller Relay charges one cent per message.
    const relay = (await call("POST", "/v1/accounts", { body: { email: "relay@gaitway.test", password: "password1", name: "Relay", kind: "seller" } })).body;
    const rk = relay.apiKey;
    const relayId = relay.account.sellerId;
    await call("POST", "/v1/services", { token: rk, body: { name: "Relay", description: "Messaging API", priceNote: "1 cent per message", url: "http://localhost:4000" } });

    // 3 + 4. An agent sends messages, paying as it goes; wallet falls, Relay's owed rises.
    const ak = agents[0].apiKey;
    const cred = (await call("POST", "/v1/credentials", { token: ak, body: { sellerId: relayId, maxMicros: "1000000" } })).body.credential;
    let prevOwed = 0n;
    for (let m = 1; m <= 25; m++) {
      const seen = await call("GET", `/v1/credentials/${cred.id}`, { token: rk });
      expect(seen.body.credential.status).toBe("active");
      const ch = await call("POST", "/v1/charges", {
        token: rk,
        body: { credentialId: cred.id, amountMicros: "10000", description: `message ${m}` },
        headers: { "idempotency-key": `req-${m}` },
      });
      expect(ch.status).toBe(200);
      const owed = BigInt((await call("GET", "/v1/seller/balance", { token: rk })).body.owedMicros);
      expect(owed).toBeGreaterThan(prevOwed);
      prevOwed = owed;
    }
    await call("POST", `/v1/credentials/${cred.id}/release`, { token: ak });
    const w0 = (await call("GET", "/v1/wallet", { token: ak })).body.wallet;
    expect(w0).toMatchObject({ availableMicros: "49750000", heldMicros: "0" });
    expect((await call("GET", "/v1/seller/balance", { token: rk })).body.owedMicros).toBe("250000");
    expect((await call("GET", "/v1/payments", { token: ak })).body.data).toHaveLength(25);

    // 5. An agent with an empty wallet is refused.
    const empty = await call("POST", "/v1/credentials", { token: agents[2].apiKey, body: { sellerId: relayId, maxMicros: "10000" } });
    expect(empty.status).toBe(402);
    expect(empty.body.error.code).toBe("insufficient_funds");

    // 6. Settlement moves test USDC to Relay; the books match.
    expect((await runReconcile(ctx.deps)).ok).toBe(true);
    const s = await runSettlement(ctx.deps);
    expect(s.batchId).toMatch(/^stl_/);
    expect(vault.paidTo(relayId)).toBe(250000n);
    const payouts = (await call("GET", "/v1/payouts", { token: rk })).body.data;
    expect(payouts[0]).toMatchObject({ amountMicros: "250000", status: "sent" });
    expect((await call("GET", "/v1/seller/balance", { token: rk })).body).toEqual({ owedMicros: "0", paidOutMicros: "250000" });
    expect(await runReconcile(ctx.deps)).toEqual({ ok: true, differences: [] });
    expect(await vault.getBusinessBalance(biz.account.businessId)).toBe(100_000_000n - 250_000n);
  });
});
