import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createTestClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { VaultClientConfig } from "../src/types.js";

export const ANVIL_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

const here = dirname(fileURLToPath(import.meta.url));
const contractsOut = resolve(here, "../../../contracts/out");

function artifact(file: string, name: string): { abi: unknown[]; bytecode: Hex } {
  const json = JSON.parse(readFileSync(resolve(contractsOut, file, `${name}.json`), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode.object as Hex };
}

export type TestChain = {
  rpcUrl: string;
  config: VaultClientConfig;
  test: ReturnType<typeof createTestClient>;
  stop: () => void;
};

async function waitForRpc(url: string, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`anvil did not start at ${url}`);
}

/** Starts anvil on a random port and deploys MockUSDC + GaitwayVault from the Foundry artifacts. */
export async function startChain(): Promise<TestChain> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const bin = process.env.ANVIL_BIN ?? "anvil";
  const proc: ChildProcess = spawn(bin, ["--port", String(port), "--silent"], { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}`;
  await waitForRpc(rpcUrl);

  const chain = { ...foundry, rpcUrls: { default: { http: [rpcUrl] } } };
  const account = privateKeyToAccount(ANVIL_KEY);
  const pub = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ chain, transport: http(rpcUrl), account });
  const test = createTestClient({ chain, transport: http(rpcUrl), mode: "anvil" });

  const usdcArt = artifact("MockUSDC.sol", "MockUSDC");
  const vaultArt = artifact("GaitwayVault.sol", "GaitwayVault");
  const usdcHash = await wallet.deployContract({ abi: usdcArt.abi, bytecode: usdcArt.bytecode });
  const usdcAddress = (await pub.waitForTransactionReceipt({ hash: usdcHash })).contractAddress as Hex;
  const vaultHash = await wallet.deployContract({
    abi: vaultArt.abi,
    bytecode: vaultArt.bytecode,
    args: [usdcAddress, account.address],
  });
  const vaultAddress = (await pub.waitForTransactionReceipt({ hash: vaultHash })).contractAddress as Hex;

  return {
    rpcUrl,
    test,
    config: {
      rpcUrl,
      chainId: 31337,
      vaultAddress,
      usdcAddress,
      adminPrivateKey: ANVIL_KEY,
      confirmations: 1,
      testAddressMnemonic: ANVIL_MNEMONIC,
    },
    stop: () => proc.kill(),
  };
}
