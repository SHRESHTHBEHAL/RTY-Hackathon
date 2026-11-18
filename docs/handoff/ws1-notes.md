# Workspace 1 (Vault): handoff notes

Branch `ws1-vault`. Owns `contracts/`, `packages/chain/`, this file.

## What exists

| Task | Status | Where |
|---|---|---|
| 1 Vault deposits and registration | done | `contracts/src/GaitwayVault.sol` |
| 2 Settle, withdraw, pause + invariant | done | same; `contracts/test/VaultInvariant.t.sol` |
| 3 Deploy script | done | `contracts/script/Deploy.s.sol`, `contracts/deployments/31337.json` |
| 4 Chain client basics | done | `packages/chain/src/*` |
| 5 Deposits feed, settle, withdraw | done | `packages/chain/src/client.ts` |
| 6 One-command local chain | done | `packages/chain/scripts/dev.ts` |
| 7 Fee collection, 7-day exit | done | implemented with Task 1–2 (the fixed interface requires them to compile) |
| 8 Hardening + Base Sepolia docs | done (deploy documented, not performed) | `contracts/SECURITY.md`, `contracts/README.md`, retry in client |
| 9 Dwarpal rail (`DWARPAL_GATEWAY=gaitway`) | done, local branch only | Dwarpal `gaitway-bridge` |
| 10 Dwarpal policy hook | done, local branch only | Dwarpal `gaitway-bridge` |

## How to run

Prerequisites: Node 22+, pnpm 9, Foundry on `PATH` (see `packages/chain/README.md`).

```sh
cd contracts && pnpm install && forge test -vv
cd ../packages/chain && pnpm install && pnpm test
pnpm chain:dev        # anvil on 8545 + deploy + prints settings; Ctrl+C to stop
```

Results at hand-off: `forge test` 33 passed (30 unit, 2 deploy, 1 invariant at 64 runs × 64 depth,
~4,000 calls, 0 reverts). `pnpm test` 21 passed.

## For Core (integration, `context.md` §12)

- `apps/api/src/vault/chain.ts`: `createVaultClient({...})` from the §10 settings. Nothing else.
- Fresh anvil addresses are fixed: vault `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`,
  USDC `0x5FbDB2315678afecb367f032d93F642f64180aa3`. They are in `packages/chain/.env.example`.
- A revert throws `VaultRevertError` with `errorName` (for example `InsufficientBalance`).
- `testDeposit` is three transactions (mint, approve, deposit) and returns the deposit's hash.
  Match top-ups to `getDeposits` by `txHash`.
- When you see an `ExitRequested` (M2), settle that business immediately (see below).

## Where `context.md` is unclear or wrong

1. **Confirmation count.** §9 says `getConfirmedBlock` is "head minus the confirmation count".
   The WS1 plan's Task 5 test (3 confirmations → visible after two more blocks) means
   `head - (confirmations - 1)`. Built to the plan. Under the literal §9 reading, with anvil's
   one-block-per-transaction mining and `CONFIRMATIONS=1`, a top-up would stay `pending` until
   some unrelated transaction mined a block, which would stall the demo.
2. **Fixed at integration:** `contracts` is now listed in the root `pnpm-workspace.yaml` (without it, `pnpm install` inside `contracts/` installs nothing and `forge test` cannot find OpenZeppelin). `pnpm --filter @gaitway/chain chain:dev` needs the root `pnpm-workspace.yaml`, which Core
   owns. On `ws1-vault` alone, run `pnpm chain:dev` inside `packages/chain`. Core's workspace file
   must list `packages/*` (and `contracts` if you want its install to run from the root).
3. **`packages/chain` tests need the Foundry artifacts** in `contracts/out`; `pretest` runs
   `forge build --root ../../contracts`. "Installs and tests with only `contracts/` beside it" holds.
4. **Exit vs. unsettled charges (design gap).** `executeExit` pays out the whole on-chain balance.
   Charges the ledger has not settled yet are still owed to sellers, who would then go unpaid from
   the vault. The 7-day delay lets Core settle first (tested), but nothing forces it.
5. **Re-registration** was unspecified in §9; the plan says it replaces the address. That also means
   a leaked registrar key can redirect a seller's payout. Noted in `SECURITY.md`.
6. **Errors** are not in §9's interface. The vault adds: `ZeroAddress`, `ZeroAmount`,
   `BusinessNotRegistered`, `SellerNotRegistered`, `KeyAlreadyUsed`, `InsufficientBalance`,
   `InsufficientFeeBalance`, `FeeExceedsGross`, `NotWithdrawAddress`, `ExitNotRequested`, `ExitNotReady`.
   `withdraw` and `deposit` also revert on a zero amount.
7. **`createVaultClient` takes an optional second argument** (`VaultClientOptions`: transport,
   retry count, log page size) for tests. The §9 signature still works unchanged.
8. **Windows.** Long paths break the default pnpm layout; `packages/chain/.npmrc` uses
   `node-linker=hoisted` and `package.json` pins one `esbuild`.
9. **Buildathon rules vs. §13.** Judges read only the fork's default branch at 7:00 PM IST,
   while §13 says nobody commits to `main` until integration. The integrator must merge before the freeze.

## Dwarpal bridge (Tasks 9–10)

Done on a local branch `gaitway-bridge` of `Aadhar-Gupta-0/dwarpal`, **not pushed**, as instructed.
It touches `pay/gateway.py` (lane B) and `server/` and needs the Dwarpal owner's agreement before
merging.

- Branch `gaitway-bridge` cut from Dwarpal `main` at `ce10418`.
- `7fe6d94` feat(pay): gaitway gateway mode (`pay/gateway.py`, `tests/server/test_gaitway_gateway.py`)
- `4458e3a` feat(server): gaitway policy hook (`server/gaitway_policy.py`, one router line in
  `server/api.py`, `server/API.md`, `docs/GAITWAY_BRIDGE.md`, `tests/server/test_gaitway_policy.py`)
- Results: bridge tests 32 passed; full Dwarpal suite 216 passed, 1 skipped; `run_pipeline.py` → `PIPELINE OK`.
- The checkout lives in a folder the app made for this session. To keep it, push the branch
  (only once the founder says so) or copy the two commits with `git format-patch ce10418`.
- Policy hook outcomes: unmapped/inactive agent → block (`passport`); paused/revoked mandate →
  block (`mandate_inactive`); seller unmapped or outside allow-list → hold (`new_vendor`);
  above threshold / per-payment cap / daily cap → hold. `approvalLink` is always null.
