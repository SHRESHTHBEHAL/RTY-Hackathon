# Workspace 2 (Core) — handoff notes

Branch: `ws2-core`. Owner dirs: root config files, `apps/api/`, this file.

## Status: Milestone 1 complete (Tasks 1–10). Milestone 2 not started.

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

1. Add `"@gaitway/chain": "workspace:*"` to `apps/api/package.json`.
2. Create `apps/api/src/vault/chain.ts` calling `createVaultClient` with the
   §10 settings, and return it from `getVault()` when `VAULT_DRIVER=chain`.
3. `CONFIRMATIONS` must match the chain client's (used by reconcile, see 10).
