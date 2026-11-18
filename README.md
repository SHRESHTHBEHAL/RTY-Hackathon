# Gaitway: a payment gateway for AI agents

### The idea

Gaitway is Stripe for AI agents: a way for software to pay for things on
its own, safely, a few cents at a time.

- **A business** creates its agents and gives each one its own wallet with
  a fixed amount of money and spending rules (per payment, per day, which
  sellers). An agent can never spend more than its wallet holds.
- **A seller** (any paid API: messaging, data, search) integrates Gaitway
  once, the way it would integrate a card gateway.
- **An agent** that hits a paywall asks Gaitway for a short-lived, signed
  payment credential for that one seller and a maximum amount. That amount
  is put on hold in its wallet. The seller checks the credential, charges
  it, and only then delivers. No human, no card, no checkout page.
- **The money lives in code.** Funds sit in a vault smart contract holding
  USDC, a digital dollar. Each payment is recorded instantly in Gaitway's
  own ledger, so a one-cent charge costs nothing extra. Sellers are paid
  out from the vault in batches, and a reconciliation job checks after
  every payout that the ledger and the vault agree to the cent. Businesses
  and sellers only ever see dollars; nobody handles crypto or network fees.
- **Businesses keep control.** Every payment goes through their rules, and
  they can plug in their own approval service (for example Dwarpal) to
  allow, hold or block each one.

Today it runs on test money only. Real money waits on a licensing opinion,
a currency partner, an identity-check provider and an audit of the vault.

- **Team:** darWIN: Shreshth Behal, Ronit Pahuja, Aadhar Gupta
- **Track:** Build for AI Agents (`ai-agents`)

### Problem: who faces it and why it happens

An AI agent that needs a paid tool hits a paywall and stops, because paying
needs a human with a card. Give the agent a card and it can be talked into
spending anything. Businesses running agents have no safe way to let them
buy what they need, and sellers have no simple way to accept agents as
paying customers.

### What we built

A business gives each agent its own wallet with a fixed balance. A seller
adds a few lines of code. The agent pays on its own, and never more than
its wallet holds.

- `packages/sdk`: the seller SDK (verify a payment credential, charge
  first, then deliver; Express middleware that answers "402 Payment
  Required") and the agent SDK (a `fetch` that pays automatically when a
  seller asks). Includes a stand-in API used for tests and the demo.
- `packages/mcp`: an MCP server that gives an agent a wallet as tools:
  check balance, find sellers, make a paid request, pay a seller.
- `contracts` and `packages/chain`: the vault smart contract that holds
  the money, with its tests and deploy script, and the client that drives
  it. See `docs/handoff/ws1-notes.md`.
- `apps/demo`: Relay, a sample paid messaging API, and an agent that pays
  it one cent per message.
- `apps/api`: the gateway backend. A double-entry ledger on Postgres and
  the HTTP API for businesses, agents, and sellers: wallets, credentials
  and holds, charges, spending rules, settlement, and reconciliation. See
  `docs/handoff/ws2-notes.md`.
- `apps/gateway`: the same gateway API as a zero-setup, in-memory service
  on port 8787, for running the demo without Postgres.
- `apps/dashboard`: the web app. A landing page, docs, a seller
  directory, sign-up and log-in, a business dashboard, a seller dashboard,
  and a live demo screen at `/demo` where the "gate lane" animation shows
  each payment passing or being refused.

### The hardest part

Making payment safe when the buyer is software. The agent gets a signed,
short-lived credential for one seller with a maximum amount, and that
amount is put on hold in its wallet. The seller verifies the credential
locally, charges before delivering, and a retried request is charged only
once. An agent that gets a second "payment required" stops instead of
looping, and the agent's key and tokens never appear in anything the MCP
tools return.

### What is not built

No real money moves. The three parts were built in parallel against one
shared contract (`context.md`) and each is tested on its own, but they
have not been run together end to end: the dashboard runs on built-in
sample data, and the terminal demo runs against the in-memory gateway.
Connecting the dashboard and SDK to `apps/api` is described in
`context.md` section 12 and is not verified.

### How to run it

Needs Node 22 or later and pnpm.

```bash
pnpm install
pnpm --filter @gaitway/sdk build
pnpm --filter @gaitway/demo demo        # the agent-pays-seller story in the terminal
pnpm --filter @gaitway/sdk test         # 89 tests
pnpm --filter @gaitway/mcp test         # 24 tests
pnpm --filter @gaitway/dashboard dev    # http://localhost:3000
```

To see the gateway as its own service, start it in one terminal and run
the demo against it from another:

```bash
pnpm --filter @gaitway/gateway dev      # gateway on http://localhost:8787
set -a; source apps/gateway/.env.demo; set +a; pnpm --filter @gaitway/demo demo
```

Sample dashboard logins are at the top of
`apps/dashboard/lib/api/fixtures.ts`. To connect the MCP server to Claude
Code, see `packages/mcp/README.md`.

**Full stack (API, vault, Postgres):**

```bash
docker compose up -d --wait                        # Postgres (GAITWAY_PG_PORT if 5432 is taken)
(cd contracts && pnpm install) && (cd packages/chain && pnpm install)
pnpm --filter @gaitway/chain chain:dev             # anvil on 8545 + vault deploy; prints settings
cd apps/api && cp .env.example .env && pnpm install && pnpm dev   # API on :8787 (VAULT_DRIVER=chain for the real vault)
pnpm --filter @gaitway/api seed:demo               # business, seller "Relay", three agents (50 / 30 / 0 dollars)
pnpm --filter @gaitway/api test
(cd contracts && forge test)                       # 33 vault tests (needs Foundry)
pnpm --filter @gaitway/chain test                  # 21 chain-client tests
```

Wiring everything together: `context.md` section 12.


### Demo

1. Without Gaitway, an agent calls Relay and gets "402 Payment Required".
2. With the SDK, the agent Scout sends five messages and pays one cent
   each from its own wallet.
3. Broke, an agent with an empty wallet, is refused and nothing is sent.
4. Open `http://localhost:3000/demo`. Press `1`, `2`, or `3` to run an
   agent, `B` to try a $5.00 payment against a $2.00 limit (refused at
   the gate with the reason), and `R` to reset.

Live (real-money) mode stays off until there is a licensing opinion, a
currency partner, an identity-check provider and an independent audit of the
vault. The currency and identity integrations are simulations today.
