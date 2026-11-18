# Gaitway: a payment gateway for AI agents

Design, 18 November 2026. Status: awaiting approval.

"Gaitway" is the working name, taken from the project folder.

## Intent

AI agents increasingly need to buy things on their own: API access, data,
tools such as a messaging platform. Today that needs a human with a card.

Gaitway lets a business give each of its agents a wallet with money in it,
and lets a seller accept payment from those agents by integrating Gaitway
once, the way it would integrate Razorpay or Stripe. The agent chooses
Gaitway at the seller, pays from its wallet, and gets the service.

The money itself is held in code: a smart contract holds the funds, not a
bank account of ours. People using Gaitway see ordinary money amounts and
never handle crypto.

Reference product: Skyfire (skyfire.xyz). Gaitway copies its proven flow
(reserve funds, deliver, charge, settle) and differs in where the money
sits.

## Who uses it

- **Business (buyer):** creates agents, funds wallets, watches spending.
- **Agent:** software holding an API key for one wallet. Spends freely up
  to that wallet's balance.
- **Seller:** a platform such as Unipile. Integrates a small SDK, charges
  agents, receives payouts.

## Goals for version 1

1. A business can create agents, each with its own wallet ID and API key.
2. A business can add money and move it into individual agent wallets.
3. An agent can pay a seller with one call, with no human involved.
4. A seller can accept agent payments with roughly 20 lines of code.
5. A seller is guaranteed payout for every charge Gaitway confirms. The
   seller charges first and delivers on confirmation, so it never delivers
   unpaid.
6. All funds sit in a vault smart contract; the contract's balance always
   covers what the ledger says is owed.
7. Everything runs end to end in test mode with test money.

## Non-goals for version 1

- Real money. Version 1 runs on a test network only.
- Converting regular currency in and out (top-up by card or UPI, payout to
  a bank). The slot for it exists; the partner integration does not.
- Subscriptions and recurring charges.
- Refunds, reversals, and disputes.
- A separate live mode. Version 1 is a single test-network deployment.
- Paying at ordinary online shops that have not integrated Gaitway.
- Identity verification (KYC) of businesses. The credential carries the
  business's name and email as entered, marked unverified.
- A public directory where agents discover sellers.
- Per-agent spending rules beyond the wallet balance (seller allow-lists,
  per-payment caps).
- Our own licence or charter.

## Anti-goals

These would make it a failure even if it runs:

- An agent can spend more than its wallet holds, including under
  simultaneous requests.
- The ledger and the vault disagree about how much money exists.
- A seller delivers a service and cannot collect on a valid authorisation.
- A payment requires a blockchain transaction, a network fee, or a crypto
  wallet on the agent's or seller's side.
- Seller integration takes more than an afternoon.

## Constraints

- Regular money cannot sit in a smart contract; only a tokenised form can.
  The vault therefore holds USDC, a dollar-backed token. All amounts are in
  US dollars. Showing other currencies is a later display concern.
- Holding or moving customer funds is regulated in most countries, and a
  contract we operate may still count. This needs a lawyer's opinion before
  any real money is accepted. Version 1 avoids the question by using test
  money only.
- The project folder is empty; there is no existing code to fit.

## Approaches considered

| | Where money sits | Trade-off |
|---|---|---|
| A. Custodial (Skyfire's way) | Our bank account; wallets are database rows | Fast and cheap, but we hold customer money directly |
| B. Fully on-chain | One smart-contract wallet per agent; every payment is an on-chain transfer | We never touch funds, but each small payment costs a fee and sellers must handle crypto |
| C. Hybrid | One vault contract holds each business's funds; a fast off-chain ledger tracks per-agent balances; sellers are paid in batches | Money is held in code and payments are instant and free, at the cost of keeping two systems in agreement |
| C2. Chartered partner | A licensed bank or gateway holds funds; our code holds the rules | No crypto at all, but the money is not in code |

**Chosen: C, the hybrid.** The founder picked it and confirmed that the
money must be held in code, which rules out A and C2. B was dropped because
per-payment fees and delays break small pay-per-use purchases.

## How it works

### The four parts

1. **Vault contract.** Holds USDC. Tracks one balance per business.
2. **Ledger service.** The fast record of who owns what: each business's
   unallocated funds, each agent wallet, funds on hold, and what each
   seller is owed. Every movement is a balanced double entry.
3. **Payment credential.** A signed token an agent hands to a seller. It
   says who the agent is, which business owns it, which seller it is for,
   the maximum amount, and when it expires.
4. **Integrations.** A seller SDK, an agent SDK with an MCP server, and a
   web dashboard.

### Money flow

1. **Top up.** Funds are deposited into the vault under the business's ID.
   The ledger credits the business's unallocated balance once the deposit
   is confirmed on-chain. In test mode a dashboard button does this with
   test USDC from a project-owned test account.
2. **Allocate.** The business moves money from unallocated into an agent's
   wallet, or back. Ledger only; nothing moves on-chain.
3. **Authorise.** The agent asks Gaitway for a credential naming a seller
   and a maximum amount. The ledger places that amount on hold in the
   agent's wallet. If the wallet cannot cover it, the request is refused.
4. **Present.** The agent sends its request to the seller with the
   credential in an HTTP header.
5. **Verify.** The seller's SDK checks the signature, seller, and expiry
   locally using Gaitway's public keys. This is a fast first filter that
   rejects bad requests without a network call. It does not prove funds
   remain.
6. **Charge, then deliver.** The seller calls Gaitway to charge the
   credential for the actual amount, and delivers once Gaitway confirms.
   The ledger moves that amount from hold to the seller's owed balance. A
   charge beyond the remaining amount, or after expiry, is refused, and the
   seller does not deliver. A seller that chooses to deliver first carries
   that risk itself.
7. **Release.** Whatever was not charged returns to the agent's wallet when
   the credential expires, when the agent releases it early, or when the
   seller marks a charge as final.
8. **Settle.** On a schedule, Gaitway sends one batch to the vault. For
   each business and seller pair it carries the total of confirmed charges
   and the platform fee within that total. The contract reduces the
   business's balance by the total, transfers the total minus the fee to
   the seller's payout address, and adds the fee to Gaitway's fee balance
   inside the vault.
9. **Withdraw.** A business can take unallocated funds back out of the
   vault to an address it registers.

### The vault contract

- `deposit(businessId, amount)`: anyone can deposit for a business.
- `settle(batch)`: operator only. Each item debits one business and pays
  one registered seller address. Fails if a business balance would go
  negative.
- `withdraw(businessId, amount, to)`: operator only, to that business's
  registered address.
- `pause()` and `unpause()`: owner only. Stops settle and withdraw.
- Seller payout addresses and business withdrawal addresses are registered
  on the contract by the owner, so the operator key alone cannot send funds
  to an arbitrary address.
- Owner and operator are separate keys.

### The credential

A JWT signed with ES256. Public keys are published at a standard JWKS
address so sellers verify without calling Gaitway.

| Claim | Meaning |
|---|---|
| `iss` | Gaitway |
| `sub` | Agent ID |
| `aud` | Seller ID |
| `jti` | Credential ID, used when charging |
| `exp`, `iat` | Expiry and issue time |
| `biz` | Business ID, name, email, and `verified: false` |
| `agent` | Agent name |
| `max` | Maximum chargeable amount, as a decimal string |
| `cur` | `USD` |

Lifetime defaults to 5 minutes and may be set from 10 seconds to 24 hours.
A charge must arrive before expiry.

A credential is a session with one seller, not a single request. It can be
charged many times until its maximum is used up or it expires. The agent
SDK's `pay` helper keeps one open credential per seller and reuses it,
requesting a new one only when the old one is spent or expired.

### What each party touches

**Business dashboard:** sign up, create agents, create and revoke agent API
keys, top up, allocate between wallets, see every transaction per agent,
withdraw.

**Agent API** (authenticated with the agent's key):
- get wallet balance
- create a credential for a seller and a maximum amount
- release a credential early
- list its own payments

**Agent SDK and MCP server:** one `pay` helper that requests a credential
and attaches it to a request, and handles a seller's "payment required"
reply by paying and retrying once.

**Seller dashboard:** sign up, register a service with a name and price
note, register a payout address, see charges and payouts.

**Seller API** (authenticated with the seller's key):
- charge a credential by ID for an amount, optionally marking it final
- look up a credential's status and remaining amount
- list charges and payouts

**Seller SDK:** middleware that reads the `gaitway-token` header, verifies
it, exposes the agent and business to the seller's code, and offers a
`charge(amount)` call. With no valid credential it replies HTTP 402 with a
body telling the agent the seller ID and price.

### Correctness rules

- Amounts are stored as integers in millionths of a dollar, matching USDC.
- Authorise, charge, and release each run in one database transaction with
  the wallet row locked, so simultaneous requests cannot overspend.
- Charge is idempotent: the seller sends an idempotency key, and a repeat
  returns the first result.
- A reconciliation job compares, per business, the vault balance against
  the ledger's total for that business plus unsettled amounts owed to
  sellers. Any difference raises an alert and pauses settlement.
- A deposit is credited only after a set number of block confirmations.

## What version 1 looks like when done

A scripted demo on a test network:

1. A business signs up, creates three agents, tops up 100 test dollars, and
   puts different amounts into each wallet.
2. A sample seller, a small pretend messaging API protected by the seller
   SDK, charges one cent per message.
3. An agent script sends messages through it, paying as it goes with no
   human involved.
4. The dashboards show the agent's wallet falling and the seller's owed
   balance rising.
5. An agent with an empty wallet is refused.
6. A settlement run moves test USDC on-chain to the seller's address, and
   reconciliation reports no difference.

## Builder's calls already made

These are the writer's choices, not the founder's. Each can be overruled.

- **Network:** Base, using its Sepolia test network, because fees are low
  and USDC is native there.
- **Language and layout:** one TypeScript repository holding the web app
  and API (Next.js), the SDK package, and the contract.
- **Database:** Postgres.
- **Contract tooling:** Solidity with Foundry; chain access through viem.
- **Dollar-denominated only** in version 1.
- **Charges must arrive before expiry**, with no grace period.
- **No self-service exit from the vault** in version 1; withdrawals go
  through the operator. A time-locked exit that works even if Gaitway is
  offline is required before real money.
- **Platform fee:** the ledger records a fee on each charge, taken from the
  seller's side. The rate is a setting and defaults to zero.
- **Charge before delivery** is the seller SDK's default, which is what
  makes the payout guarantee hold.
- **Addresses in test mode:** the dashboard generates a test payout address
  for each seller and a test withdrawal address for each business, so no
  one needs a crypto wallet to run version 1. With real money these become
  addresses supplied by the currency-conversion partner, so Gaitway still
  holds no user keys.
- **Keys in test mode:** the server holds both the owner and operator keys
  so sign-up registers addresses automatically. With real money the owner
  key moves to a separate multi-person signing setup.
- **One environment:** a single test-network deployment. Records carry an
  environment field so a live mode can be added without a migration.

## Left to the builder

- Database schema and API route naming.
- Dashboard look and layout.
- Settlement schedule in test mode.
- Test strategy, provided the anti-goals are each covered by a test.
- Login method for dashboards.

## Scope update: build the full product (18 November 2026)

The founder asked for the whole product, not only version 1, with a
presentable demo first. This section overrides anything above that
conflicts with it.

**Two milestones.**

- **Milestone 1, the demo:** everything under "What version 1 looks like
  when done". Built first, by all three workspaces in parallel.
- **Milestone 2, the full product:** the items below, formerly non-goals.

**Now in scope (Milestone 2):**

- Per-agent spending rules: per-payment cap, daily cap, seller allow-list.
- Subscriptions, as standing approvals ("mandates") a seller can charge
  each period without a fresh credential.
- Refunds, allowed while the seller's unsettled balance covers them.
- Withdrawals, and a 7-day time-locked exit from the vault that works even
  if Gaitway is offline.
- A seller directory agents can search.
- Seller webhooks.
- Test and live modes side by side, with live switched off by a setting.
- Regular-currency top-up and payout, and business identity checks, each
  built as a plug-in slot with a simulated provider.
- An MCP server so agents can pay as a tool.

- A direct push payment from an agent to a seller, with no credential.
- A policy hook: a business can have an outside service approve or refuse
  each payment its agents attempt.
- A bridge to Dwarpal, the companion project that decides whether an
  agent's payment should happen. Dwarpal gains Gaitway as a payment rail,
  and Gaitway can use Dwarpal as its policy hook. Details are in
  `context.md`, section 14.

**Still not buildable in code.** Live mode stays off until these exist: a
lawyer's opinion on licensing, a signed currency-conversion partner, a
signed identity-check provider, and an independent audit of the vault.

**Changed builder's calls.**

- The API is its own service, separate from the dashboard, so three teams
  can work without touching the same files.
- Every amount in the API and in the credential is a whole number of
  millionths of a dollar, written as a string. `"10000"` is one cent. This
  replaces "decimal string" in the credential table above.
- The exact shared interfaces live in `context.md` at the project root.
  Where this document and `context.md` differ on an interface detail,
  `context.md` wins.

## Before real money

Listed so nothing is forgotten:

- Legal opinion on licensing in the launch country.
- A partner to convert regular currency in and out.
- Independent audit of the vault contract.
- Business identity verification.
- Time-locked self-service exit from the vault.
- Subscriptions and per-agent spending rules.
- Refunds and disputes.
- Owner key moved off the server; a live mode beside test mode.
