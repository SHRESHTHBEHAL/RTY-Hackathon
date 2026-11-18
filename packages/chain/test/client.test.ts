import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, custom, http, parseTransaction, type Hex } from "viem";
import { createVaultClient, deriveTestAddress, toChainKey, vaultAbi, type VaultClient } from "../src/index.js";
import { startChain, type TestChain } from "./anvil.js";

let chain: TestChain;
let client: VaultClient;

beforeAll(async () => {
  chain = await startChain();
  client = createVaultClient(chain.config);
}, 60_000);

afterAll(() => chain?.stop());

async function readVault(functionName: "withdrawAddressOf" | "payoutAddressOf", key: Hex) {
  const pub = createPublicClient({ transport: http(chain.rpcUrl) });
  return pub.readContract({ address: chain.config.vaultAddress, abi: vaultAbi, functionName, args: [key] });
}

describe("vault client basics", () => {
  it("registerBusiness without an address registers the derived one", async () => {
    const { withdrawAddress, txHash } = await client.registerBusiness("biz_a");
    expect(txHash).toMatch(/^0x/);
    expect(withdrawAddress).toBe(deriveTestAddress(chain.config.testAddressMnemonic!, toChainKey("biz_a")));
    expect(await readVault("withdrawAddressOf", toChainKey("biz_a"))).toBe(withdrawAddress);
  });

  it("registerSeller registers an explicit address", async () => {
    const explicit: Hex = "0x000000000000000000000000000000000000dEaD";
    const { payoutAddress } = await client.registerSeller("sel_a", explicit);
    expect(payoutAddress).toBe(explicit);
    expect(await readVault("payoutAddressOf", toChainKey("sel_a"))).toBe(explicit);
  });

  it("testDeposit credits the business", async () => {
    await client.testDeposit("biz_a", 100_000_000n);
    expect(await client.getBusinessBalance("biz_a")).toBe(100_000_000n);
  });

  it("unknown business has balance 0", async () => {
    expect(await client.getBusinessBalance("biz_nobody")).toBe(0n);
  });

  it("fee balance starts at 0", async () => {
    expect(await client.getFeeBalance()).toBe(0n);
  });

  it("concurrent writes do not collide on nonces", async () => {
    const results = await Promise.all([
      client.registerSeller("sel_c1"),
      client.registerSeller("sel_c2"),
      client.registerSeller("sel_c3"),
    ]);
    expect(new Set(results.map((r) => r.txHash)).size).toBe(3);
  });
});

describe("write retries (Task 8)", () => {
  function faultyClient(failSends: number) {
    const sentNonces: number[] = [];
    let failuresLeft = failSends;
    const transport = custom(
      {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (method === "eth_sendRawTransaction") {
            sentNonces.push(parseTransaction((params as Hex[])[0]).nonce ?? -1);
            if (failuresLeft-- > 0) throw new Error("socket hang up");
          }
          const res = await fetch(chain.rpcUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
          });
          const body = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
          if (body.error) throw Object.assign(new Error(body.error.message), body.error);
          return body.result;
        },
      },
      { retryCount: 0 },
    );
    const c = createVaultClient(chain.config, { transport, retryDelayMs: 10 });
    return { c, sentNonces };
  }

  it("retries a transient send failure with the same nonce", async () => {
    const { c, sentNonces } = faultyClient(2);
    await c.registerSeller("sel_retry");
    expect(sentNonces.length).toBe(3);
    expect(new Set(sentNonces).size).toBe(1);
    expect(await readVault("payoutAddressOf", toChainKey("sel_retry"))).not.toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("gives up after 3 attempts", async () => {
    const { c, sentNonces } = faultyClient(5);
    await expect(c.registerSeller("sel_never")).rejects.toThrow();
    expect(sentNonces.length).toBe(3);
  });

  it("never retries a revert", async () => {
    const { c, sentNonces } = faultyClient(0);
    await expect(
      c.settle("stl_revert", [{ businessId: "biz_a", sellerId: "sel_a", grossMicros: 10n ** 15n, feeMicros: 0n }]),
    ).rejects.toThrow(/InsufficientBalance/);
    expect(sentNonces.length).toBe(0);
  });
});
