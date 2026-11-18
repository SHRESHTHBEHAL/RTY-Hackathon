# @gaitway/chain

TypeScript client for the Gaitway vault. The API uses it through the
`VaultClient` interface (`context.md` section 9) and never touches viem directly.

```ts
import { createVaultClient } from "@gaitway/chain";

const vault = createVaultClient({
  rpcUrl: process.env.RPC_URL!,
  chainId: Number(process.env.CHAIN_ID),
  vaultAddress: process.env.VAULT_ADDRESS as `0x${string}`,
  usdcAddress: process.env.USDC_ADDRESS as `0x${string}`,
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY as `0x${string}`,
  confirmations: Number(process.env.CONFIRMATIONS ?? 1),
  testAddressMnemonic: process.env.TEST_ADDRESS_MNEMONIC,
});
```

## Prerequisites

- Node 22+, pnpm 9
- Foundry (`forge`, `anvil`, `cast`) on `PATH`
  - macOS/Linux: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
  - Windows: download `foundry_stable_win32_amd64.zip` from the
    [Foundry releases](https://github.com/foundry-rs/foundry/releases), unzip, add the folder to `PATH`.
  - Or point `ANVIL_BIN` / `FORGE_BIN` at the binaries.

## Commands (run in `packages/chain`)

| Command | What it does |
|---|---|
| `pnpm install` | Install (also run `pnpm install` once in `contracts/`) |
| `pnpm test` | Builds the contracts, then runs the Vitest suite against throwaway anvil chains |
| `pnpm build` | Emits `dist/` |
| `pnpm chain:dev` | Starts anvil on 8545, deploys, prints settings, keeps running |

From the repo root once the pnpm workspace exists: `pnpm --filter @gaitway/chain chain:dev`.

On a fresh anvil the addresses are always the same:

| Setting | Value |
|---|---|
| `RPC_URL` | `http://localhost:8545` |
| `CHAIN_ID` | `31337` |
| `VAULT_ADDRESS` | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| `USDC_ADDRESS` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| `ADMIN_PRIVATE_KEY` | anvil's first default key (public, test only) |
| `TEST_ADDRESS_MNEMONIC` | `test test test test test test test test test test test junk` |
| `CONFIRMATIONS` | `1` (Base Sepolia: `3`) |

## Behaviour worth knowing

- **Writes are serialised** through one queue, so nonces never collide.
- **Retries:** a transient RPC failure while sending is retried up to 3 times with the
  *same nonce*. A revert is detected in simulation and never retried; it throws
  `VaultRevertError` whose `errorName` is the Solidity error (for example `InsufficientBalance`).
- **Idempotency:** `settle` and `withdraw` check `usedKey` first and treat a
  `KeyAlreadyUsed` revert as `{ txHash: null, alreadyDone: true }`. An empty batch sends nothing.
- **Confirmations:** a transaction in the head block has 1 confirmation, so
  `getConfirmedBlock() = head - (confirmations - 1)`. `getDeposits` never returns
  anything above it, and pages `getLogs` in 2000-block windows.
- **Derived addresses:** with no address given, `registerBusiness`/`registerSeller`
  use `m/44'/60'/0'/0/<index>` of `testAddressMnemonic`, where index is the first
  4 bytes of the chain key mod 2^31. Test environments only.
- `testDeposit` mints MockUSDC to the admin, approves, and deposits: three transactions.
  It only works against `MockUSDC`. Core must call it only in the test environment.

## Windows note

`.npmrc` uses `node-linker=hoisted` and `package.json` pins one `esbuild` version.
Without these, nested paths exceed Windows' 260-character limit and the install fails.
