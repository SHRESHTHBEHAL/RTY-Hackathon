# Gaitway: master plan

Gaitway is a payment gateway for AI agents. A business funds a wallet per
agent, a seller integrates once, and agents pay on their own. The money is
held in a vault smart contract.

## The documents

| File | What it is | Who reads it |
|---|---|---|
| `PLAN.md` | This overview | Everyone |
| `context.md` | The shared contract: every route, type, and name the three builders must agree on | All three builders, in full |
| `docs/superpowers/specs/2026-11-18-agent-payment-gateway-design.md` | The design and the reasoning | All three builders |
| `docs/superpowers/plans/2026-11-18-ws1-vault.md` | Task-by-task plan | Account 1 |
| `docs/superpowers/plans/2026-11-18-ws2-core.md` | Task-by-task plan | Account 2 |
| `docs/superpowers/plans/2026-11-18-ws3-edge.md` | Task-by-task plan | Account 3 |
| `prompts/workspace-1-vault.md` | The message to paste into account 1 | You |
| `prompts/workspace-2-core.md` | The message to paste into account 2 | You |
| `prompts/workspace-3-edge.md` | The message to paste into account 3 | You |

## The split

| | Workspace 1: Vault | Workspace 2: Core | Workspace 3: Edge |
|---|---|---|---|
| **In one line** | Where the money sits | The brain that tracks and moves it | Everything people and agents touch |
| **Owns** | `contracts/`, `packages/chain/`, Dwarpal bridge branch | root config, `apps/api/` | `packages/sdk/`, `packages/mcp/`, `apps/dashboard/`, `apps/demo/` |
| **Milestone 1** | Vault contract, deploy script, chain client, one-command local chain | Ledger, accounts, agents and wallets, credentials, charges, settlement, reconciliation | Seller and agent SDKs, the Relay demo, business and seller dashboards, landing page, live demo screen |
| **Milestone 2** | Fee collection, time-locked exit, hardening, Dwarpal bridge | Spending rules, subscriptions, transfers, refunds, withdrawals, directory, webhooks, policy hook, currency and identity slots, live switch | MCP server, full SDK, the remaining dashboard screens, directory, docs, live integration pass |
| **Tasks** | 10 | 18 | 14 |

No workspace waits for another. Core stands in for the vault with an
in-memory version; Edge stands in for the API with a mock server and
fixture data. `context.md` is what keeps the three compatible.

## Order of work

1. **Set up sharing.** Put this folder in one git repository that all
   three accounts can reach.
2. **Send the three prompts.** Each account builds Milestone 1 on its own
   branch.
3. **Integrate Milestone 1.** Merge the three branches and follow
   `context.md` section 12. This produces the presentable demo.
4. **Milestone 2.** Each account continues down its plan.
5. **Integrate Milestone 2** and run Workspace 3's Task 14.

## What the demo shows

1. A business signs up, creates three agents, tops up 100 test dollars,
   and funds each wallet differently.
2. A sample seller, Relay, charges one cent per message.
3. An agent sends messages through Relay and pays as it goes, alone.
4. The dashboard shows the wallet falling and Relay's balance rising, live.
5. An agent with an empty wallet is refused.
6. Settlement moves the money on-chain to Relay, and the books match.

If integration is not finished by presentation time, Workspace 3's
`pnpm --filter @gaitway/demo demo` and its `/demo` screen run on their own
with stand-in data.

## Dwarpal

Dwarpal (`https://github.com/Aadhar-Gupta-0/dwarpal`) decides whether an
agent's payment should happen: it screens invoices, checks the payee,
applies limits, and sends doubtful cases to a human. Gaitway holds and
moves the money. The bridge, in Workspace 1's Milestone 2, connects them
both ways. It needs the Dwarpal owner's agreement before it merges there.

## What code cannot finish

Real money stays switched off until there is a lawyer's opinion on
licensing, a signed currency-conversion partner, a signed identity-check
provider, and an independent audit of the vault.
