/**
 * One-command local chain: starts anvil on 8545, deploys MockUSDC + GaitwayVault,
 * prints the settings Core needs, and keeps running until Ctrl+C.
 *
 *   pnpm chain:dev            (from packages/chain)
 *   pnpm --filter @gaitway/chain chain:dev   (from the repo root, once the workspace exists)
 */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
const PORT = Number(process.env.ANVIL_PORT ?? 8545);
const RPC_URL = `http://localhost:${PORT}`;
const contractsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../contracts");

async function rpcUp(): Promise<boolean> {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await rpcUp()) {
    console.error(`Something is already listening on ${RPC_URL}. Stop it first (or set ANVIL_PORT).`);
    process.exit(1);
  }
  const anvil = spawn(process.env.ANVIL_BIN ?? "anvil", ["--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  anvil.on("exit", (code) => {
    console.error(`anvil exited (${code})`);
    process.exit(code ?? 1);
  });
  const stop = () => {
    anvil.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  for (let i = 0; i < 100 && !(await rpcUp()); i++) await new Promise((r) => setTimeout(r, 100));

  const deploy = spawnSync(
    process.env.FORGE_BIN ?? "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--broadcast"],
    {
      cwd: contractsDir,
      env: { ...process.env, ADMIN_PRIVATE_KEY: ANVIL_KEY, USDC_ADDRESS: "" },
      encoding: "utf8",
    },
  );
  if (deploy.status !== 0) {
    console.error(deploy.stdout, deploy.stderr);
    anvil.kill();
    process.exit(1);
  }
  const dep = JSON.parse(readFileSync(resolve(contractsDir, "deployments/31337.json"), "utf8"));

  console.log("\nGaitway local chain is up. Paste these into apps/api/.env:\n");
  console.log(`RPC_URL=${RPC_URL}`);
  console.log(`CHAIN_ID=${dep.chainId}`);
  console.log(`VAULT_ADDRESS=${dep.vault}`);
  console.log(`USDC_ADDRESS=${dep.usdc}`);
  console.log(`ADMIN_PRIVATE_KEY=${ANVIL_KEY}`);
  console.log(`TEST_ADDRESS_MNEMONIC="${ANVIL_MNEMONIC}"`);
  console.log(`CONFIRMATIONS=1`);
  console.log("\nRunning. Ctrl+C to stop.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
