# Gaitway gateway

The payment gateway as a running HTTP service on port 8787.

```bash
pnpm --filter @gaitway/sdk build
pnpm --filter @gaitway/gateway dev
```

It seeds one business (Acme Ops), one seller (Relay), and three agents
(Scout $50, Buyer $30, Broke $0), and writes this run's test keys to
`apps/gateway/.env.demo`.

In a second terminal, run the sample seller and the paying agents against
it:

```bash
set -a; source apps/gateway/.env.demo; set +a
pnpm --filter @gaitway/demo demo
```

What it does: issues signed payment credentials, puts the amount on hold
in the agent's wallet, lets the seller charge, releases what is unused,
and enforces spending rules. Routes and shapes follow `context.md`
section 8.

What it is not: balances are in memory and reset on restart, and no real
money moves. The Postgres ledger and the link to the vault contract are
designed in `docs/superpowers/plans/2026-11-18-ws2-core.md` and not built.
