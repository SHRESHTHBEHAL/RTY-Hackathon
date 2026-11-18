# Gaitway vault contracts

`GaitwayVault` holds USDC for Gaitway. It keeps one balance per business (keyed by
`keccak256(businessId)`), pays sellers in batches, keeps the platform fee, and
offers businesses a 7-day exit that pause cannot block. Interface: `src/IGaitwayVault.sol`,
verbatim from `context.md` section 9.

| File | What |
|---|---|
| `src/IGaitwayVault.sol` | The shared interface |
| `src/GaitwayVault.sol` | The vault (AccessControl, Pausable, ReentrancyGuard, SafeERC20) |
| `src/MockUSDC.sol` | 6-decimal test token, open mint |
| `test/Vault.t.sol` | Unit tests |
| `test/VaultInvariant.t.sol` | Invariant: token balance == sum of business balances + fee balance |
| `test/Deploy.t.sol` | Deploy script test |
| `script/Deploy.s.sol` | Deploys and writes `deployments/<chainId>.json` |

## Setup and tests

Libraries come from npm (no git submodules):

```sh
cd contracts
pnpm install
forge test -vv
```

## Local deploy

```sh
anvil
# second shell
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
cat deployments/31337.json
```

Or use `pnpm chain:dev` in `packages/chain`, which does both and prints the settings.

## Roles

| Role | Can |
|---|---|
| `DEFAULT_ADMIN_ROLE` | `pause`, `unpause`, `collectFees`, grant and revoke roles |
| `REGISTRAR_ROLE` | `registerBusiness`, `registerSeller` (re-registering replaces the address) |
| `OPERATOR_ROLE` | `settle`, `withdraw` |
| A business's withdraw address | `requestExit` for that business |
| Anyone | `deposit` to a registered business; `executeExit` after the delay |

The constructor grants all three roles to `admin`. That is for test only (see `SECURITY.md`).

## Base Sepolia (documented, not performed)

Needs a funded deployer key the founder supplies. Never commit it.

```sh
export ADMIN_PRIVATE_KEY=0x...            # funded on Base Sepolia, holds all roles
export USDC_ADDRESS=                      # empty deploys MockUSDC; or Circle's Base Sepolia USDC
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --verify --verifier etherscan \
  --etherscan-api-key "$BASESCAN_API_KEY"
cat deployments/84532.json
```

Then set Core's settings: `RPC_URL=https://sepolia.base.org`, `CHAIN_ID=84532`,
`VAULT_ADDRESS`/`USDC_ADDRESS` from the file, `CONFIRMATIONS=3`.

To verify by hand afterwards:

```sh
forge verify-contract <vault> src/GaitwayVault.sol:GaitwayVault --chain 84532 \
  --constructor-args $(cast abi-encode "constructor(address,address)" <usdc> <admin>)
```

If you use real USDC instead of MockUSDC, `testDeposit` will not work (it mints).
