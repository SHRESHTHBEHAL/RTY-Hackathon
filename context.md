# Gaitway: shared context

Read this whole file before writing any code. Three builders work in
parallel and cannot talk to each other. This file is the only thing keeping
their work compatible. Treat every name, path, route, and type here as
fixed.

## 1. What Gaitway is

A payment gateway for AI agents.

- A **business** creates agents. Each agent has its own wallet ID with
  money in it and spends freely up to that balance.
- A **seller** (for example a messaging platform) integrates Gaitway once,
  the way it would integrate Razorpay or Stripe.
- An **agent** picks Gaitway at the seller, pays from its wallet, and gets
  the service. No human is involved.
- The money is **held in code**: a vault smart contract holds USDC. A fast
  off-chain ledger tracks each agent's balance. Sellers are paid on-chain
  in batches. Nobody using Gaitway handles crypto or pays a network fee.

Full design: `docs/superpowers/specs/2026-11-18-agent-payment-gateway-design.md`.
Read it too. Where it and this file differ on an interface detail, this
file wins.

## 2. Payment flow

1. **Top up:** funds enter the vault under the business's key. The ledger
   credits the business's unallocated balance once confirmed on-chain.
2. **Allocate:** the business moves money into an agent wallet. Ledger only.
3. **Authorise:** the agent asks for a credential naming a seller and a
   maximum. That amount is put on hold in its wallet.
4. **Present:** the agent calls the seller with the credential in the
   `gaitway-token` HTTP header.
5. **Verify:** the seller SDK checks signature, audience, and expiry
   locally against Gaitway's public keys.
6. **Charge, then deliver:** the seller charges the credential through the
   API and delivers only after the charge is confirmed.
7. **Release:** unused hold returns to the wallet on expiry, on early
   release by the agent, or when the seller marks a charge final.
8. **Settle:** a scheduled job sends one batch to the vault, which pays
   each seller and keeps the platform fee in the vault's fee balance.

A credential is a session with one seller. It can be charged many times
until its maximum is used or it expires.

## 3. Milestones

- **Milestone 1 (M1), the demo.** Build this first, completely, before any
  M2 work. It must be presentable.
- **Milestone 2 (M2), the full product.**

Every route and feature below is tagged M1 or M2.

## 4. The three workspaces

Each workspace owns directories. **Never create or edit a file outside the
directories you own.** If you believe this contract is wrong or incomplete,
do not change it. Write the problem to `docs/handoff/ws<N>-notes.md` and
build to the contract as written.

| Workspace | Owns | Builds |
|---|---|---|
| **1. Vault** | `contracts/`, `packages/chain/`, and the `gaitway-bridge` branch of the separate Dwarpal repository (section 14) | The vault smart contract, its tests and deploy scripts, the TypeScript client that talks to it, and the Dwarpal bridge |
| **2. Core** | repo root config files, `apps/api/`, `docker-compose.yml` | The ledger, the HTTP API, credential signing, settlement, reconciliation |
| **3. Edge** | `packages/sdk/`, `packages/mcp/`, `apps/dashboard/`, `apps/demo/` | The whole frontend (public website, business dashboard, seller dashboard, docs, the live demo screen), plus the seller SDK, agent SDK, MCP server, and the demo |

All three may write only their own file under `docs/handoff/`.

Plans:

- `docs/superpowers/plans/2026-11-18-ws1-vault.md`
- `docs/superpowers/plans/2026-11-18-ws2-core.md`
- `docs/superpowers/plans/2026-11-18-ws3-edge.md`

### Working without the others

No workspace waits for another.

- **Vault** needs nothing from the others.
- **Core** codes against the `VaultClient` interface in section 9 using its
  own in-memory implementation.
- **Edge** codes against the HTTP contract in section 8, using a small mock
  server for the SDKs and fixture data for the dashboard.

Each owned directory must install, build, and test on its own, without the
other workspaces' directories present.

## 5. Stack and global constraints

- Node 22 or later, pnpm 9 or later, TypeScript 5 in `strict` mode, ES
  modules.
- **Root files.** Workspace 2 owns the repository root, but every builder
  needs these four files to run anything. Whoever starts first creates
  them with exactly this content; anyone who finds them already present
  leaves them alone.

  `pnpm-workspace.yaml`:

  ```yaml
  packages:
    - "apps/*"
    - "packages/*"
  ```

  `package.json`:

  ```json
  {
    "name": "gaitway",
    "private": true,
    "type": "module",
    "engines": { "node": ">=22" },
    "scripts": {
      "test": "pnpm -r test",
      "build": "pnpm -r build"
    }
  }
  ```

  `tsconfig.base.json`:

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "declaration": true,
      "sourceMap": true
    }
  }
  ```

  `.gitignore`:

  ```
  node_modules/
  dist/
  .next/
  out/
  cache/
  broadcast/
  .env
  .env.*
  !.env.example
  .DS_Store
  test-results/
  playwright-report/
  ```
- Tests: Vitest for TypeScript, Foundry (`forge test`) for Solidity.
- Solidity `^0.8.24`, OpenZeppelin Contracts v5.
- Chain access: viem. Local chain: anvil on port 8545. Public test network:
  Base Sepolia (chain ID 84532).
- API: Hono on Node, Drizzle ORM, Postgres 16, zod for validation, `jose`
  for tokens.
- Dashboard: Next.js (App Router), Tailwind CSS.
- Package scope: `@gaitway/*`. Package names: `@gaitway/chain`,
  `@gaitway/api`, `@gaitway/sdk`, `@gaitway/mcp`, `@gaitway/dashboard`,
  `@gaitway/demo`.
- Ports: API 8787, dashboard 3000, demo seller 4000, anvil 8545,
  Postgres 5432.
- Postgres URL in development:
  `postgres://gaitway:gaitway@localhost:5432/gaitway`.
- No secrets in the repository. Every package has a `.env.example`.
- Write tests first. Commit after every task.

## 6. Money and identifiers

**Amounts.** Every amount is a whole number of millionths of a US dollar
("micros"), matching USDC's 6 decimals. In JSON and in tokens it is a
string of digits: `"10000"` is one cent, `"1000000"` is one dollar. Field
names end in `Micros`. In TypeScript, parse to `bigint`. Never use floating
point for money. Currency is always USD.

**Identifiers.** A prefix, an underscore, then 24 lowercase base-36
characters.

| Thing | Prefix | | Thing | Prefix |
|---|---|---|---|---|
| Account | `acc_` | | Charge | `chg_` |
| Business | `biz_` | | Refund | `rfd_` |
| Agent | `agt_` | | Payout | `pay_` |
| Wallet | `wal_` | | Top-up | `top_` |
| Seller | `sel_` | | Withdrawal | `wdr_` |
| Service | `svc_` | | Settlement batch | `stl_` |
| Credential | `crd_` | | Mandate | `mdt_` |
| API key record | `key_` | | Webhook event | `evt_` |

Each agent has exactly one wallet.

**On-chain keys.** The vault identifies things by `bytes32`. The key for
any identifier is `keccak256` of its UTF-8 bytes:
`toChainKey("biz_abc…")`. This applies to business, seller, batch, and
withdrawal identifiers.

**Environments.** Every record carries `env`: `"test"` or `"live"`. API
keys encode it. Live is refused with error `live_disabled` unless the
setting `LIVE_ENABLED=true`. M1 only ever uses `test`.

**API keys.** Sent as `Authorization: Bearer <key>`.

| Holder | Format |
|---|---|
| Business | `gw_<env>_biz_<32 chars>` |
| Agent | `gw_<env>_agt_<32 chars>` |
| Seller | `gw_<env>_sel_<32 chars>` |

Keys are shown once at creation and stored hashed. Dashboard users log in
with email and password and receive a session token, also sent as a Bearer
token; it starts with `gws_`.

## 7. The credential

A JWT signed with ES256. Header: `alg: "ES256"`, `kid`,
`typ: "gaitway-credential+jwt"`.

| Claim | Value |
|---|---|
| `iss` | The API's public base URL, from setting `GAITWAY_ISSUER`. Development: `http://localhost:8787` |
| `sub` | Agent ID |
| `aud` | Seller ID |
| `jti` | Credential ID |
| `iat`, `exp` | Seconds since epoch |
| `env` | `"test"` or `"live"` |
| `biz` | `{ "id", "name", "email", "verified": boolean }` |
| `agent` | `{ "id", "name" }` |
| `max` | Maximum chargeable amount, micros string |
| `cur` | `"USD"` |

Lifetime: default 300 seconds, minimum 10, maximum 86400.

Public keys: `GET {iss}/.well-known/jwks.json`.

A **mandate** (M2) is a token of the same shape with
`typ: "gaitway-mandate+jwt"`, `jti` the mandate ID, no `max`, and extra
claims `maxPerPeriod` (micros string) and `period`
(`"day" | "week" | "month"`). It expires after one year. Agents present it
in the `gaitway-mandate` header.

**When a seller has no valid credential** it replies HTTP 402 with:

```json
{
  "error": { "code": "payment_required", "message": "Pay with Gaitway" },
  "gaitway": {
    "sellerId": "sel_…",
    "priceMicros": "10000",
    "priceNote": "per message",
    "apiBase": "http://localhost:8787"
  }
}
```

`priceMicros` and `priceNote` may be null.

**Request ID.** The agent SDK sends the header `gaitway-request-id`, a
fresh random value per logical request and the same value when it retries
that request. The seller SDK uses it as the charge's idempotency key, so a
retried request is charged once.

## 8. HTTP API (owned by Core, consumed by Edge)

Base path `/v1`. JSON in and out.

**Errors.** Non-2xx responses have this body:

```json
{ "error": { "code": "insufficient_funds", "message": "Human-readable text" } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing or bad key or session |
| `forbidden` | 403 | Valid key, wrong owner or wrong key type |
| `not_found` | 404 | |
| `validation_failed` | 422 | Bad input |
| `insufficient_funds` | 402 | Wallet or unallocated balance too low |
| `credential_expired` | 409 | |
| `credential_not_active` | 409 | Released or exhausted |
| `amount_exceeds_remaining` | 409 | Charge larger than what is left |
| `idempotency_conflict` | 409 | Same key, different request body |
| `rule_violation` | 403 | A spending rule blocked it (M2) |
| `insufficient_seller_balance` | 409 | Refund larger than unsettled balance (M2) |
| `live_disabled` | 403 | |

**Lists.** `GET` list routes accept `?cursor=&limit=` (default 50, maximum
200) and return `{ "data": [...], "nextCursor": string | null }`, newest
first.

An error may carry an optional `details` object beside `code` and
`message`.

**Idempotency.** `POST /charges`, `POST /mandate-charges`,
`POST /transfers`, and `POST /refunds` require an `Idempotency-Key` header. A repeat with the same
key and body returns the original response.

### Objects

```ts
type Micros = string; // digits only
type Env = "test" | "live";

type Account = { id: string; email: string; name: string;
  kind: "business" | "seller"; businessId: string | null; sellerId: string | null };

type Agent = { id: string; name: string; walletId: string;
  status: "active" | "disabled"; createdAt: string };

type Wallet = { walletId: string; agentId: string;
  availableMicros: Micros; heldMicros: Micros };

type Credential = { id: string; sellerId: string; agentId: string; businessId: string;
  maxMicros: Micros; remainingMicros: Micros;
  status: "active" | "released" | "expired" | "exhausted";
  expiresAt: string; token?: string /* only on creation */ };

type Charge = { id: string; credentialId: string | null; mandateId: string | null;
  sellerId: string; agentId: string; amountMicros: Micros; feeMicros: Micros;
  refundedMicros: Micros; description: string | null; createdAt: string };

type Topup = { id: string; amountMicros: Micros; method: "test" | "ramp";
  status: "pending" | "confirmed" | "failed"; txHash: string | null; createdAt: string };

type Payout = { id: string; sellerId: string; amountMicros: Micros;
  status: "pending" | "sent"; txHash: string | null; createdAt: string };

type Transaction = { id: string;
  type: "topup" | "allocation" | "hold" | "release" | "charge" | "refund" | "withdrawal";
  walletId: string | null; amountMicros: string /* may start with "-" */;
  counterparty: string | null; createdAt: string };

type Service = { id: string; sellerId: string; name: string; description: string;
  priceNote: string; url: string; active: boolean };

type Seller = { id: string; name: string; services: Service[] };

type ApiKey = { id: string; label: string; lastFour: string; createdAt: string };

// M2
type Rules = { perPaymentMaxMicros: Micros | null; dailyMaxMicros: Micros | null;
  allowedSellerIds: string[] | null };
type Mandate = { id: string; walletId: string; agentId: string; sellerId: string;
  maxPerPeriodMicros: Micros; period: "day" | "week" | "month";
  status: "active" | "revoked"; createdAt: string; token?: string };
type Refund = { id: string; chargeId: string; amountMicros: Micros; createdAt: string };
type Withdrawal = { id: string; amountMicros: Micros;
  status: "pending" | "sent"; txHash: string | null; createdAt: string };
```

Dates are ISO 8601 strings in UTC.

### Public routes

| | Route | Request | Response |
|---|---|---|---|
| M1 | `GET /health` (no `/v1`) | | `{ "ok": true }` |
| M1 | `GET /.well-known/jwks.json` (no `/v1`) | | JWKS |
| M1 | `POST /v1/accounts` | `{ email, password, name, kind }` | `{ account, sessionToken, apiKey }` |
| M1 | `POST /v1/sessions` | `{ email, password }` | `{ account, sessionToken }` |
| M2 | `GET /v1/sellers?query=` | | list of `Seller` |
| M2 | `GET /v1/sellers/:id` | | `{ seller }` |

Creating an account also creates its business or seller and one API key of
the matching type, returned once as `apiKey`.

### Any session or key

| | Route | Request | Response |
|---|---|---|---|
| M1 | `GET /v1/me` | | `{ account }` |
| M1 | `GET /v1/keys` | | list of `ApiKey` |
| M1 | `POST /v1/keys` | `{ label }` | `{ key: ApiKey, apiKey }` |
| M1 | `DELETE /v1/keys/:id` | | `{ ok: true }` |

`/v1/keys` manages the business or seller key of the calling account.

### Business routes (business session or business key)

| | Route | Request | Response |
|---|---|---|---|
| M1 | `POST /v1/agents` | `{ name }` | `{ agent, apiKey }` |
| M1 | `GET /v1/agents` | | list of `Agent` |
| M1 | `GET /v1/agents/:id` | | `{ agent, wallet }` |
| M1 | `PATCH /v1/agents/:id` | `{ name?, status? }` | `{ agent }` |
| M1 | `GET /v1/agents/:id/keys` | | list of `ApiKey` |
| M1 | `POST /v1/agents/:id/keys` | `{ label }` | `{ key, apiKey }` |
| M1 | `DELETE /v1/agents/:id/keys/:keyId` | | `{ ok: true }` |
| M1 | `GET /v1/balance` | | `{ unallocatedMicros, wallets: Wallet[] }` |
| M1 | `POST /v1/topups` | `{ amountMicros, method }` | `{ topup }` |
| M1 | `GET /v1/topups` | | list of `Topup` |
| M1 | `POST /v1/allocations` | `{ walletId, amountMicros, direction }` | `{ unallocatedMicros, wallet }` |
| M1 | `GET /v1/transactions?walletId=` | | list of `Transaction` |
| M2 | `GET /v1/agents/:id/rules` | | `{ rules }` |
| M2 | `PUT /v1/agents/:id/rules` | `Rules` | `{ rules }` |
| M2 | `GET /v1/mandates` | | list of `Mandate` |
| M2 | `DELETE /v1/mandates/:id` | | `{ mandate }` |
| M2 | `POST /v1/withdrawals` | `{ amountMicros }` | `{ withdrawal }` |
| M2 | `GET /v1/withdrawals` | | list of `Withdrawal` |
| M2 | `GET /v1/policy-hook` | | `{ url: string \| null }` |
| M2 | `PUT /v1/policy-hook` | `{ url }` | `{ url, secret }` |
| M2 | `DELETE /v1/policy-hook` | | `{ ok: true }` |

`direction` is `"to_wallet"` or `"to_unallocated"`. `method: "test"` is
allowed only in the test environment and makes the vault mint and deposit
test USDC; the top-up becomes `confirmed` once the deposit is seen on-chain.

### Agent routes (agent key)

| | Route | Request | Response |
|---|---|---|---|
| M1 | `GET /v1/wallet` | | `{ wallet }` |
| M1 | `POST /v1/credentials` | `{ sellerId, maxMicros, ttlSeconds? }` | `{ credential }` with `token` |
| M1 | `POST /v1/credentials/:id/release` | | `{ credential }` |
| M1 | `GET /v1/payments` | | list of `Charge` |
| M2 | `POST /v1/mandates` | `{ sellerId, maxPerPeriodMicros, period }` | `{ mandate }` with `token` |
| M2 | `POST /v1/transfers` | `{ sellerId, amountMicros, reference? }` | `{ charge }` |

`POST /v1/transfers` is a push payment: the agent pays a seller directly,
with no credential and no seller call. It moves the amount from the
wallet's available balance to the seller's owed balance and returns a
`Charge` whose `credentialId` and `mandateId` are null and whose
`description` is the `reference`. Rules and the policy hook apply.

### Seller routes (seller session or seller key)

| | Route | Request | Response |
|---|---|---|---|
| M1 | `POST /v1/charges` | `{ credentialId, amountMicros, final?, description? }` | `{ charge, remainingMicros }` |
| M1 | `GET /v1/charges` | | list of `Charge` |
| M1 | `GET /v1/credentials/:id` | | `{ credential }` without `token` |
| M1 | `GET /v1/payouts` | | list of `Payout` |
| M1 | `GET /v1/seller/balance` | | `{ owedMicros, paidOutMicros }` |
| M1 | `POST /v1/services` | `{ name, description, priceNote, url }` | `{ service }` |
| M1 | `GET /v1/services` | | list of `Service` |
| M1 | `PATCH /v1/services/:id` | any of the fields, `active` | `{ service }` |
| M1 | `GET /v1/payout-address` | | `{ address }` |
| M2 | `PUT /v1/payout-address` | `{ address }` | `{ address }` |
| M2 | `POST /v1/mandate-charges` | `{ mandateId, amountMicros, description? }` | `{ charge }` |
| M2 | `POST /v1/refunds` | `{ chargeId, amountMicros? }` | `{ refund }` |
| M2 | `PUT /v1/webhook` | `{ url }` | `{ url, secret }` |

A seller's payout address is generated and registered on the vault when
the seller account is created. `GET /v1/credentials/:id` is allowed to the
seller the credential names and to the agent that owns it.

### Behaviour the tables do not show

- `POST /v1/credentials` fails with `insufficient_funds` if the wallet's
  available balance is below `maxMicros`. Otherwise it moves `maxMicros`
  from available to held.
- `POST /v1/charges` checks, in order: the credential names this seller;
  it is active and not expired; `amountMicros` is at most
  `remainingMicros`. It then moves the amount from held to the seller's
  owed balance. If `final` is true, or the remainder reaches zero, the
  remaining hold is released and the status becomes `released` or
  `exhausted`.
- The fee is `floor(amountMicros * PLATFORM_FEE_BPS / 10000)`.
  `PLATFORM_FEE_BPS` defaults to `0`. `charge.amountMicros` is the gross.
- Expired credentials have their holds released by a sweeper within 10
  seconds of expiry.
- A disabled agent cannot create credentials.
- M2 rules are checked when a credential or mandate is created
  (`perPaymentMaxMicros` against `maxMicros`, `allowedSellerIds`) and when
  a charge is made (`dailyMaxMicros`, counted over the UTC day).
- M2 mandate charges take money straight from the wallet's available
  balance, with no hold, and fail if the period total would exceed
  `maxPerPeriodMicros`.
- M2 refunds default to the full remaining charge amount, return money to
  the agent's wallet, and fail with `insufficient_seller_balance` if the
  seller's unsettled owed balance is smaller than the refund.
- M2 webhooks: `POST` to the seller's URL with body
  `{ id, type, createdAt, data }` and header `gaitway-signature`, the hex
  HMAC-SHA256 of the raw body using the webhook secret. Types:
  `payout.sent`, `charge.refunded`, `mandate.revoked`.

- M2 policy hook: if the business has set one, Core calls it before
  creating a credential, a mandate, or a transfer, and after its own rules
  pass. Core sends `POST {url}` with the header `gaitway-signature` (hex
  HMAC-SHA256 of the raw body using the hook secret) and this body:

  ```json
  { "id": "evt_…", "type": "credential", "agentId": "agt_…", "walletId": "wal_…",
    "sellerId": "sel_…", "amountMicros": "10000", "createdAt": "2026-11-18T10:00:00Z" }
  ```

  `type` is `"credential"`, `"mandate"`, or `"transfer"`. For a mandate,
  `amountMicros` is `maxPerPeriodMicros`. The hook must answer HTTP 200
  within 2 seconds with:

  ```json
  { "outcome": "allow", "reasons": [], "approvalLink": null }
  ```

  `outcome` is `"allow"`, `"hold"`, or `"block"`. Anything other than a
  valid `allow`, including a timeout or an error, refuses the request with
  `rule_violation`, `message` set to the reasons joined by `"; "`, and
  `details: { "outcome", "approvalLink" }`. Gaitway keeps no pending state:
  after a human approves a hold on the hook's side, the agent simply tries
  again.

## 9. The vault (owned by Vault, consumed by Core)

### Solidity interface

```solidity
interface IGaitwayVault {
    struct SettleItem { bytes32 businessKey; bytes32 sellerKey; uint256 gross; uint256 fee; }

    event BusinessRegistered(bytes32 indexed businessKey, address withdrawAddress);
    event SellerRegistered(bytes32 indexed sellerKey, address payoutAddress);
    event Deposited(bytes32 indexed businessKey, address indexed from, uint256 amount);
    event Settled(bytes32 indexed batchKey, bytes32 indexed businessKey,
                  bytes32 indexed sellerKey, uint256 gross, uint256 fee);
    event Withdrawn(bytes32 indexed withdrawalKey, bytes32 indexed businessKey,
                    address to, uint256 amount);
    event FeesCollected(address to, uint256 amount);          // M2
    event ExitRequested(bytes32 indexed businessKey, uint256 executableAt); // M2
    event ExitExecuted(bytes32 indexed businessKey, address to, uint256 amount); // M2

    function registerBusiness(bytes32 businessKey, address withdrawAddress) external; // REGISTRAR
    function registerSeller(bytes32 sellerKey, address payoutAddress) external;       // REGISTRAR
    function deposit(bytes32 businessKey, uint256 amount) external;                   // anyone
    function settle(bytes32 batchKey, SettleItem[] calldata items) external;          // OPERATOR
    function withdraw(bytes32 withdrawalKey, bytes32 businessKey, uint256 amount) external; // OPERATOR
    function pause() external;                                                        // admin
    function unpause() external;                                                      // admin
    function collectFees(address to, uint256 amount) external;                        // admin, M2
    function requestExit(bytes32 businessKey) external;   // the business's withdraw address, M2
    function executeExit(bytes32 businessKey) external;   // anyone, after EXIT_DELAY, M2

    function balanceOf(bytes32 businessKey) external view returns (uint256);
    function feeBalance() external view returns (uint256);
    function withdrawAddressOf(bytes32 businessKey) external view returns (address);
    function payoutAddressOf(bytes32 sellerKey) external view returns (address);
    function usedKey(bytes32 key) external view returns (bool);
}
```

Rules:

- Roles use OpenZeppelin `AccessControl`: `DEFAULT_ADMIN_ROLE`,
  `REGISTRAR_ROLE`, `OPERATOR_ROLE`.
- `deposit` reverts for an unregistered business.
- `settle`, for each item: reduce the business balance by `gross`, send
  `gross - fee` USDC to the seller's payout address, add `fee` to the fee
  balance. Revert the whole batch if any balance would go negative, any
  seller is unregistered, or `fee > gross`.
- `settle` and `withdraw` revert with `KeyAlreadyUsed(bytes32)` if their
  batch or withdrawal key was used before. This makes retries safe.
- `pause` blocks `settle` and `withdraw`. It never blocks `executeExit`.
- `EXIT_DELAY` is 7 days.
- Invariant: the vault's USDC balance equals the sum of all business
  balances plus the fee balance.
- The token address is a constructor argument. Development and test
  deployments use `MockUSDC`, a 6-decimal token anyone can mint.

### Deployment file

The deploy script writes `contracts/deployments/<chainId>.json`:

```json
{ "chainId": 31337, "vault": "0x…", "usdc": "0x…", "deployBlock": 0 }
```

### TypeScript client (`@gaitway/chain`)

```ts
export type Hex = `0x${string}`;

export function toChainKey(id: string): Hex; // keccak256 of UTF-8 bytes

export type SettleItem = {
  businessId: string; sellerId: string; grossMicros: bigint; feeMicros: bigint };

export type DepositEvent = {
  businessKey: Hex; amountMicros: bigint; txHash: Hex; logIndex: number; blockNumber: bigint };

export interface VaultClient {
  registerBusiness(businessId: string, withdrawAddress?: Hex):
    Promise<{ withdrawAddress: Hex; txHash: Hex }>;
  registerSeller(sellerId: string, payoutAddress?: Hex):
    Promise<{ payoutAddress: Hex; txHash: Hex }>;
  /** Test environment only. Mints MockUSDC and deposits it for the business. */
  testDeposit(businessId: string, amountMicros: bigint): Promise<{ txHash: Hex }>;
  /** Idempotent: if batchId was already settled, resolves with alreadyDone true. */
  settle(batchId: string, items: SettleItem[]):
    Promise<{ txHash: Hex | null; alreadyDone: boolean }>;
  /** Idempotent in the same way, keyed by withdrawalId. */
  withdraw(withdrawalId: string, businessId: string, amountMicros: bigint):
    Promise<{ txHash: Hex | null; alreadyDone: boolean }>;
  getBusinessBalance(businessId: string): Promise<bigint>;
  getFeeBalance(): Promise<bigint>;
  /** Highest block considered final: head minus the confirmation count. */
  getConfirmedBlock(): Promise<bigint>;
  /** Deposits in [fromBlock, toBlock], both inclusive, ordered. */
  getDeposits(fromBlock: bigint, toBlock: bigint): Promise<DepositEvent[]>;
}

export type VaultClientConfig = {
  rpcUrl: string; chainId: number; vaultAddress: Hex; usdcAddress: Hex;
  adminPrivateKey: Hex;      // holds all three roles in test
  confirmations: number;     // 1 on anvil, 3 on Base Sepolia
  testAddressMnemonic?: string; // derives addresses when none is supplied
};

export function createVaultClient(config: VaultClientConfig): VaultClient;
```

When `registerBusiness` or `registerSeller` is called without an address,
the client derives one from `testAddressMnemonic`, using an index taken
from the chain key, and registers that.

## 10. Settings

| Name | Used by | Development value |
|---|---|---|
| `DATABASE_URL` | Core | `postgres://gaitway:gaitway@localhost:5432/gaitway` |
| `GAITWAY_ISSUER` | Core | `http://localhost:8787` |
| `PORT` | Core | `8787` |
| `PLATFORM_FEE_BPS` | Core | `0` |
| `LIVE_ENABLED` | Core | `false` |
| `VAULT_DRIVER` | Core | `memory` or `chain` |
| `SETTLE_INTERVAL_SECONDS` | Core | `30` |
| `SESSION_SECRET` | Core | any long random string |
| `RPC_URL` | Core, Vault | `http://localhost:8545` |
| `CHAIN_ID` | Core, Vault | `31337` |
| `VAULT_ADDRESS`, `USDC_ADDRESS` | Core, Vault | from the deployment file |
| `ADMIN_PRIVATE_KEY` | Core, Vault | anvil's first default key |
| `TEST_ADDRESS_MNEMONIC` | Core, Vault | anvil's default mnemonic |
| `CONFIRMATIONS` | Core, Vault | `1` |
| `NEXT_PUBLIC_API_BASE` | Edge | `http://localhost:8787` |
| `API_MODE` | Edge | `fixtures` or `live` |
| `GAITWAY_API_BASE` | Edge | `http://localhost:8787` |
| `DEMO_RELAY_URL` | Edge | `http://localhost:4000` |
| `DEMO_BUSINESS_KEY`, `DEMO_SELLER_KEY` | Edge, server side only | printed by the API's demo seed |
| `DEMO_AGENT_KEYS` | Edge, server side only | three agent keys, comma separated, in the seed's order |

## 11. The demo (what M1 must show)

1. A business signs up, creates three agents, tops up 100 test dollars,
   and puts different amounts into each wallet.
2. A sample seller called **Relay**, a pretend messaging API protected by
   the seller SDK, charges one cent per message.
3. An agent script sends messages through Relay, paying as it goes.
4. The dashboard shows the agent's wallet falling and Relay's owed balance
   rising, live.
5. An agent with an empty wallet is refused.
6. Settlement moves test USDC on-chain to Relay's address, and
   reconciliation reports no difference.

## 12. Putting the three together

Done once all three have finished M1, by whoever is asked to integrate.

1. Put all owned directories in one checkout. They do not overlap.
2. In `apps/api`, add the dependency `"@gaitway/chain": "workspace:*"` and
   create `apps/api/src/vault/chain.ts` that builds a `VaultClient` with
   `createVaultClient` from the settings in section 10.
3. Start Postgres, start anvil and deploy (`pnpm --filter @gaitway/chain
   chain:dev`), copy the addresses into the API's settings, set
   `VAULT_DRIVER=chain`.
4. Start the API, then the dashboard with `API_MODE=live`, then the demo.
5. Run the demo in section 11 end to end and fix whatever disagrees with
   this file. Record each fix in `docs/handoff/integration-notes.md`.

## 13. Sharing the work

The three builders share one git repository holding this folder. Each
works on its own branch: `ws1-vault`, `ws2-core`, `ws3-edge`. Because the
owned directories do not overlap, the branches merge without conflicts.
Nobody commits to `main`; the integrator merges the three branches there.

## 14. Dwarpal (the companion project)

Dwarpal is a separate, private repository:
`https://github.com/Aadhar-Gupta-0/dwarpal`. It is Python (FastAPI, an MCP
server, SQLite) with a Next.js dashboard, and it belongs to another team.

**What it does.** Dwarpal is the trust layer in front of a payment. An
agent paying supplier invoices holds no payment credentials and can only
ask. Dwarpal reads the invoice and scans it for hidden instructions, checks
the payee against a trusted vendor list, applies the agent's mandate
(allow-list, per-payment cap, daily cap, approval threshold), and answers
allow, hold, or block. Holds go to a human approver. Every step lands in a
tamper-evident log. Its payment step today is either simulated or a
RazorpayX test payout in rupees.

**How the two fit.** Dwarpal decides whether a payment should happen.
Gaitway holds the money and moves it. Two connections, both M2:

1. **Gaitway as Dwarpal's payment rail.** Dwarpal's `pay/gateway.py` has a
   gateway switch (`DWARPAL_GATEWAY`: `mocked` or `razorpay_test`). The
   bridge adds a third value, `gaitway`. When Dwarpal releases a payment,
   it calls `POST /v1/transfers` with the agent's Gaitway key, and the
   money leaves that agent's Gaitway wallet.
2. **Dwarpal as Gaitway's policy hook.** A business points its Gaitway
   policy hook (section 8) at a new Dwarpal route. Every credential,
   mandate, and transfer its agents attempt is then checked against the
   agent's Dwarpal mandate first.

**Bridge details.**

- Work happens in a separate checkout of Dwarpal, on a branch named
  `gaitway-bridge`. Never commit to Dwarpal's `main`. Never push or open a
  pull request without the founder saying so.
- Dwarpal's own rules: each lane edits only its folders, `contracts/` is
  frozen, and `pay/` belongs to its lane B. The bridge touches `pay/` and
  `server/`, so the founder must clear it with Dwarpal's owner before it
  merges. Do not edit `contracts/`.
- Settings the bridge reads: `GAITWAY_API_BASE`, `GAITWAY_AGENT_KEY` (must
  start with `gw_test_agt_`), `GAITWAY_HOOK_SECRET`, and
  `GAITWAY_INR_PER_USD`.
- Dwarpal refuses to start if any setting holds a live key. Add `gw_live_`
  to that list.
- Dwarpal works in rupees with decimal amounts; Gaitway works in dollar
  micros. The bridge converts with the fixed test rate
  `GAITWAY_INR_PER_USD`, rounding down to a whole micro. This is a
  test-only stand-in and must be labelled as such wherever it appears.
- A Dwarpal vendor account maps to a Gaitway seller through a new optional
  field on the stored vendor account, `gaitway_seller_id`. An account
  without it cannot be paid through Gaitway.
- Dwarpal's idempotency key for the payment is passed as the
  `Idempotency-Key` header and as `reference`.

## 15. What code cannot finish

Live mode stays off until these exist. Build the slots, not the real thing.

- A lawyer's opinion on licensing in the launch country.
- A signed partner for converting regular currency in and out.
- A signed provider for business identity checks.
- An independent audit of the vault contract.
