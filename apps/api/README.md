# @gaitway/api — Gaitway Core

The ledger and HTTP API for Gaitway (Workspace 2). Hono on Node, Postgres 16,
zod, jose. The contract it implements is `context.md` sections 6–10.

## Run it

Postgres (from the repo root):

```bash
docker compose up -d --wait
# Port 5432 already taken on your machine? Pick another host port:
GAITWAY_PG_PORT=5433 docker compose up -d --wait   # then use :5433 in .env
```

API:

```bash
cd apps/api
cp .env.example .env          # set SESSION_SECRET; adjust ports if needed
pnpm install
pnpm migrate                  # optional: the server also migrates on start
pnpm dev                      # http://localhost:8787  (curl localhost:8787/health)
```

Seed the demo (with the API running):

```bash
pnpm --filter @gaitway/api seed:demo
```

It creates `demo@gaitway.test` (business), `relay@gaitway.test` (seller, service
"Relay", 1 cent per message), tops up 100 test dollars, and creates agents
Atlas, Beacon and Comet holding 50, 30 and 0 dollars. Both accounts use the
demo-only password `gaitway-demo` (override with `DEMO_PASSWORD`). Every key is
printed once; re-running signs in and issues fresh keys.

Tests (real Postgres; the `gaitway_test` database is created automatically):

```bash
pnpm --filter @gaitway/api test
pnpm --filter @gaitway/api build
```

## Settings

| Name | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://gaitway:gaitway@localhost:5432/gaitway` | |
| `TEST_DATABASE_URL` | `postgres://gaitway:gaitway@localhost:5432/gaitway_test` | tests only |
| `GAITWAY_ISSUER` | `http://localhost:8787` | credential `iss` |
| `PORT` | `8787` | |
| `PLATFORM_FEE_BPS` | `0` | fee = floor(amount × bps / 10000) |
| `LIVE_ENABLED` | `false` | `gw_live_` keys get `live_disabled` |
| `VAULT_DRIVER` | `memory` | `chain` is wired at integration (context.md §12) |
| `SETTLE_INTERVAL_SECONDS` | `30` | settlement + reconciliation cadence |
| `SESSION_SECRET` | — | required, 16+ chars |
| `RAMP_PROVIDER` | `none` | `simulated` = **simulation** of a currency partner (uses the vault's test deposit) |
| `IDENTITY_PROVIDER` | `none` | `simulated` = **simulation**: marks every business verified, checks nothing |
| `RATE_LIMIT_PER_10S` | `100` | per API key or session; then HTTP 429 `rate_limited` |
| `RPC_URL`, `CHAIN_ID`, `VAULT_ADDRESS`, `USDC_ADDRESS`, `ADMIN_PRIVATE_KEY`, `TEST_ADDRESS_MNEMONIC`, `CONFIRMATIONS` | | chain driver |

The route list is served at `GET /v1/openapi.json`.

**Both the currency partner and the identity provider are simulations.** No real
money and no real identity check exist until the items in context.md section 15
are in place.

## How it works

- **Ledger** (`src/ledger/ledger.ts`): double-entry. `post()` is the only
  function that changes balances. It runs inside a transaction, locks touched
  account rows in a fixed order (`SELECT … FOR UPDATE`, sorted by kind then
  owner), rejects postings that do not sum to zero, and refuses to take any
  non-external account below zero (`insufficient_funds`). Amounts are `bigint`
  micros end to end; Postgres `bigint` columns; digit strings in JSON.
- **Accounts**: `external`, `unallocated(business)`, `available(wallet)`,
  `held(wallet)`, `owed(seller)` (net of fee), `fees`, `settling(batch)`.
- **Credentials**: ES256 JWTs, one key pair stored in `signing_keys`,
  published at `/.well-known/jwks.json`. Creating one holds `maxMicros`.
- **Charges**: lock the credential row, check seller → status/expiry →
  remaining, then `held → owed + fees`. `Idempotency-Key` rows are written in
  the same transaction, so a retried request replays byte-identical output.
- **Jobs** (`src/jobs/runner.ts`): deposit crediting and the expiry sweeper
  every 5 s; settlement every `SETTLE_INTERVAL_SECONDS`, then reconciliation.
  Settlement batches are keyed by ID on the vault, so a crash between the vault
  call and the database update finishes on the next run without paying twice.
  A vault rejection or a reconciliation difference pauses settlement until
  restart.
- **Vault**: `src/vault/types.ts` is the `VaultClient` interface verbatim from
  context.md §9. `src/vault/memory.ts` stands in for the contract. Its state
  lives in the API process: restarting the API with the memory vault loses
  vault balances, so reset the database (`docker compose down -v`) and re-seed.
