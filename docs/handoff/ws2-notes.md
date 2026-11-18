# Workspace 2 (Core) — handoff notes

Branch: `ws2-core`. Owner dirs: root config files, `apps/api/`, this file.

## Status: Milestone 1 (Tasks 1–10) and Milestone 2 (Tasks 11–18) complete.

Tests: 92 tests in 21 files, all passing against Postgres 16 (`pnpm --filter @gaitway/api test`).
`pnpm --filter @gaitway/api build` is clean.

### Milestone 2 summary

- **Rules** (`src/rules/check.ts`): per-payment max and allow-list at credential/mandate/transfer
  time; daily max (UTC day) at charge time, serialised per agent by locking the agent row.
- **Mandates**: `gaitway-mandate+jwt` tokens (one year), `POST /v1/mandate-charges` from
  available with no hold, calendar day / ISO week / calendar month periods in UTC, revoke.
- **Transfers**: push payments, idempotent, rules + policy hook apply.
- **Refunds**: default to the full remaining amount; fee share returned in proportion (rounded
  down) for charges not yet in a settlement batch. Unsettled refunds net against the next
  settlement batch for the same business and seller (see item 13 below).
- **Withdrawals**: unallocated → `withdrawing` → vault, keyed by withdrawal ID; a crash after the
  vault call completes once on retry (job every 5 s).
- **Directory** (`GET /v1/sellers?query=`, `GET /v1/sellers/:id`), **webhooks**
  (`payout.sent`, `charge.refunded`, `mandate.revoked`; HMAC `gaitway-signature`; 5 attempts with
  exponential backoff).
- **Policy hook**: called outside any transaction, 2 s timeout, signed, anything but a valid
  `allow` refuses with `rule_violation` and `details: { outcome, approvalLink }`.
- **Slots**: `RampProvider` and `IdentityProvider` with **simulated** implementations only
  (`RAMP_PROVIDER=simulated`, `IDENTITY_PROVIDER=simulated`). Nothing real is wired.
- **Hardening**: live keys refused unless `LIVE_ENABLED=true`, and live/test data never mix;
  rate limit (`RATE_LIMIT_PER_10S`, default 100 per key or session) → HTTP 429;
  `GET /v1/openapi.json` lists every section 8 route.

## Milestone 1 detail

What exists in `apps/api`:

- Double-entry ledger with a single `post()` that locks rows in a fixed order.
- Every M1 route in context.md §8: accounts, sessions, `/v1/me`, keys, agents
  and agent keys, wallets, balance, top-ups, allocations, transactions,
  credentials (+ release, read), charges (idempotent), payments, seller balance,
  services, payout address, payouts, `/health`, `/.well-known/jwks.json`.
- ES256 credential tokens matching §7 exactly (header `typ`, every claim).
- Background jobs: deposit crediting, expiry sweeper, settlement, reconcile.
- In-memory `VaultClient`; `VAULT_DRIVER=chain` throws until integration wires
  `src/vault/chain.ts` (§12 step 2 — `getVault` in `src/vault/index.ts` is the
  one place to change).
- `seed:demo` script and an end-to-end test of the six demo steps of §11.

How to run: see `apps/api/README.md`.

Tests: 66 tests in 12 files, all passing against Postgres 16. These include the
concurrency cases from the plan: 20 concurrent postings, opposite-order
postings, two simultaneous credentials against one wallet, 10 concurrent
charges, a charge racing the sweeper at expiry, concurrent identical
idempotent charges, and crashes before and after the vault settle call.

## Where context.md was unclear or wrong (built as written; my reading noted)

1. **Design spec missing.** `docs/superpowers/specs/2026-11-18-agent-payment-gateway-design.md`
   and `context.md` itself are not in the repository. I built from the copies
   I was given (context.md + the WS2 plan). They should be committed to `main`.
2. **`GET /v1/me` with an agent key.** An agent has no account. It returns the
   owning business's account.
3. **`/v1/keys` with an agent key.** Returns `forbidden`; agent keys are
   managed through `/v1/agents/:id/keys`.
4. **Transaction IDs.** §6 has no prefix for ledger transactions. `Transaction.id`
   is the posting ID with prefix `pst_`.
5. **Success status codes.** Not specified; every success is HTTP 200 (also for
   creates).
6. **`remainingMicros` after release/expiry.** Set to `"0"` (nothing more can be
   charged). `final: true` charges also reply `remainingMicros: "0"`.
7. **Status of an unswept expired credential.** Reported as `"expired"` as soon
   as `expiresAt` passes, even before the sweeper releases the hold.
8. **Charge on an unknown credential.** Not in the §8 check list; returns
   `not_found`.
9. **`settle`/`withdraw` with `alreadyDone: true` return `txHash: null`.** If the
   process dies after the vault call, the payout written on recovery has
   `txHash: null`. Suggest the chain client return the original tx hash when it
   can find it.
10. **Reconciliation needs the chain head.** To ignore deposits not yet
    credited, Core needs deposits above the confirmed block, but `VaultClient`
    has no head-block method. I use `getConfirmedBlock() + CONFIRMATIONS`.
    A `getHeadBlock()` would be cleaner.
11. **Seller balance during settlement.** `owedMicros` is net of fees. While a
    batch is in flight (a few seconds), its amount has left `owed` but is not yet
    in `paidOutMicros`.
12. **Business `GET /v1/credentials/:id`.** §8 allows only the named seller and
    the owning agent; a business key gets `forbidden`.
13. **Refunds after settlement cannot be represented on the vault.** The vault has
    no way to move money from one business's balance to another or back from a
    seller. Core therefore nets each unsettled refund against the next batch for
    the *same business and seller*. A pair whose net would be negative waits for
    later charges. Reconciliation counts unsettled refunds, so it stays
    consistent. For a settled charge the platform keeps its fee and the seller's
    owed balance covers the whole refund.
14. **`perPaymentMaxMicros` and mandates.** A mandate has no `maxMicros`, so the
    per-payment maximum is checked on each mandate charge, and the allow-list
    when the mandate is created.
15. **Policy hook failures.** A timeout, a non-200 reply or a malformed body are
    reported as `rule_violation` with `details.outcome = "block"` and
    `approvalLink: null`; the contract does not name an outcome for these.
16. **Transfers and the policy hook on retry.** The hook is called before the
    idempotency check, so a retried transfer asks the hook again.
17. **Errors not in the table.** Rate limiting returns HTTP 429 with code
    `rate_limited`, which is not in the section 8 error table.
18. **Routes not in section 8.** Two extra routes: `POST /v1/verification` runs
    the identity provider (simulated), and `GET /v1/openapi.json` is the route
    list. `PUT /v1/payout-address` re-registers the seller on the vault.
19. **Withdrawals the vault rejects** stay `pending` and are retried every 5 s;
    the `Withdrawal` type has no `failed` status.
20. **Live data.** Signup always creates test accounts, so live data exists only
    for `gw_live_` keys. No route issues one yet; that waits for section 15.

## Deviations from the plan / stack

- **No Drizzle.** To fit the hackathon window, the API uses `postgres` (postgres.js)
  with tagged SQL, and an idempotent DDL migration (`src/db/schema.ts`,
  applied on server start and by `pnpm migrate`). This is internal to Core.
- **Postgres host port** is `${GAITWAY_PG_PORT:-5432}` in `docker-compose.yml`, so
  it can run beside another local Postgres. The default is still 5432.
- **Lockfile ignored.** `pnpm-lock.yaml` is in `.gitignore`, per the Buildathon
  rule that lockfiles stay out of git.
- **Memory vault state is per process.** Restarting the API with
  `VAULT_DRIVER=memory` loses vault balances, and reconciliation will then
  report differences. Reset with `docker compose down -v` and re-seed.
- The demo seed uses the fixed demo password `gaitway-demo` for the two test
  accounts. It can be overridden with `DEMO_PASSWORD`.

## For the integrator (§12)

`apps/api/src/vault/chain.ts` already exists: with `VAULT_DRIVER=chain` it
loads `@gaitway/chain` at runtime and calls `createVaultClient` with the §10
settings. Only the dependency is left:

1. Add `"@gaitway/chain": "workspace:*"` to `apps/api/package.json` dependencies.
2. `pnpm --filter @gaitway/chain build` (its `exports` point at `dist/`), then `pnpm install`.
3. Start the chain: `pnpm --filter @gaitway/chain chain:dev`. Paste the printed
   `RPC_URL`, `CHAIN_ID`, `VAULT_ADDRESS`, `USDC_ADDRESS`, `ADMIN_PRIVATE_KEY`,
   `TEST_ADDRESS_MNEMONIC` and `CONFIRMATIONS` into `apps/api/.env`. Set
   `VAULT_DEPLOY_BLOCK` to `deployBlock` from `contracts/deployments/<chainId>.json`,
   and set `VAULT_DRIVER=chain`.
4. Reset the database first (`docker compose down -v`, then up). Data seeded
   against the memory vault does not exist on the chain.
5. CORS is on (`CORS_ORIGINS`, default `*`), so the dashboard on :3000 can call the API.

Notes from reading `ws1-vault`: its `getConfirmedBlock` is `head - (confirmations - 1)`,
and `getDeposits` never returns anything above the confirmed block. So reconciliation
can briefly see vault money (a fresh deposit) that the ledger has not credited yet.
Reconcile reports that, but pauses settlement only on a shortfall, and not while a
batch or withdrawal is in flight. That settles item 10 above.
