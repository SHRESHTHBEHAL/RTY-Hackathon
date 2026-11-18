# @gaitway/sdk

Seller and agent clients for Gaitway, the payment gateway for AI agents.
Node 20 or later. Amounts are micros strings: `"10000"` is one cent. Use `usd("0.01")` to convert.

```sh
pnpm add @gaitway/sdk
```

## Seller quickstart

Charge an agent one cent per request with the Express middleware (`express` is a peer dependency).

```ts
import express from "express";
import { GaitwaySeller, usd } from "@gaitway/sdk";
import { gaitwayExpress } from "@gaitway/sdk/express";

const seller = new GaitwaySeller({
  apiKey: process.env.GAITWAY_SELLER_KEY!, // gw_test_sel_...
  sellerId: process.env.GAITWAY_SELLER_ID!, // sel_...
  baseUrl: "http://localhost:8787",
});

const app = express();
app.post(
  "/relay",
  gaitwayExpress(seller, { priceMicros: usd("0.01"), priceNote: "per message" }),
  (req, res) => res.json({ ok: true, paidBy: req.gaitway!.claims.business.name }),
);
app.listen(3000);
```

With no valid credential the middleware answers HTTP 402 with a Gaitway body. With one, it
charges the price first, then runs your handler with `req.gaitway` set. A retried request
(same `gaitway-request-id` header) is charged once. Without Express, use `seller.verify(token)`,
`seller.charge({ credentialId, amountMicros })` and `seller.paymentRequired(price)` directly.

## Agent quickstart

```ts
import { GaitwayAgent } from "@gaitway/sdk";

const agent = new GaitwayAgent({ apiKey: process.env.GAITWAY_AGENT_KEY!, baseUrl: "http://localhost:8787" });
const res = await agent.fetch("http://localhost:3000/relay", {
  method: "POST",
  body: JSON.stringify({ text: "hello" }),
});
console.log(res.status, await agent.payments());
await agent.releaseAll(); // return unspent holds to the balance
```

`agent.fetch` works like `fetch`. When a seller answers 402 with a Gaitway body, it opens a
credential for that seller (`sessionMicros`, default $1, or `opts.maxMicros`, capped to the
available balance), retries once, and reuses the credential for later calls to the same seller.

- A second 402 after paying throws `GaitwayError` with code `payment_failed`. It never tries a third time.
- An empty balance throws `GaitwayError` with code `insufficient_funds`.
- A 402 without a Gaitway body is returned to you untouched.
- The request body must be re-sendable (string, bytes, `FormData`, `URLSearchParams`, `Blob`).
  Stream bodies are not supported and throw `TypeError`.

Also available: `agent.balance()`, `agent.createCredential({ sellerId, maxMicros, ttlSeconds? })`,
`agent.release(credentialId)`.

## Finding sellers

```ts
const sellers = await agent.findSellers("translation"); // Seller[] with their active services
const one = await agent.getSeller("sel_...");
```

## Mandates

A mandate lets a seller charge an agent repeatedly, up to a limit per `day`, `week` or `month`,
without opening a credential each time. The money comes straight from the available balance.

```ts
// Agent
const mandate = await agent.createMandate({ sellerId, maxPerPeriodMicros: usd("20"), period: "month" });
// send mandate.token to the seller in the `gaitway-mandate` header

// Seller
const claims = await seller.verifyMandate(req.get("gaitway-mandate")!); // throws GaitwayError "invalid_mandate"
const charge = await seller.chargeMandate({ mandateId: claims.mandateId, amountMicros: usd("5"), description: "May plan" });
```

`verifyMandate` checks the signature, audience and expiry locally; `chargeMandate` fails if
the mandate was revoked, the period limit would be exceeded, or the balance is too low.

## Transfers

A push payment from the agent straight to a seller, with no credential and no seller call.

```ts
const charge = await agent.transfer({ sellerId, amountMicros: usd("12.50"), reference: "invoice 42" });
```

## Refunds

```ts
await seller.refund({ chargeId: charge.id });                         // everything not yet refunded
await seller.refund({ chargeId: charge.id, amountMicros: usd("1") }); // part of it
```

The money goes back to the agent's balance. A refund larger than your unsettled balance fails
with `insufficient_seller_balance`.

`chargeMandate`, `transfer` and `refund` send an `Idempotency-Key`. Pass your own
`idempotencyKey` to make a retry safe; without one a fresh key is generated per call.

## Spending rules and the policy hook

A business's spending rules or policy hook can refuse a credential, mandate or transfer with
`GaitwayError` code `rule_violation`. When the hook refused it, `err.details` is
`{ outcome: "hold" | "block", approvalLink: string | null }`: after a human approves a hold
through `approvalLink`, try again.

## Webhooks

Gaitway signs each webhook with the `gaitway-signature` header. Verify it against the raw body,
before parsing JSON:

```ts
import { verifyWebhook } from "@gaitway/sdk";

app.post("/gaitway/webhook", express.text({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.get("gaitway-signature") ?? "", process.env.GAITWAY_WEBHOOK_SECRET!);
  // event.type: "payout.sent" | "charge.refunded" | "mandate.revoked"
  res.sendStatus(200);
});
```

A bad signature throws `GaitwayError` with code `invalid_signature`.

## Testing

`@gaitway/sdk/testing` exports `startMockGaitway()`, an in-memory API for tests and local work.
Besides accounts and balances it has `addService`, `setRules`, `setPolicyOutcome`,
`revokeMandate` and `settleSeller` for exercising mandates, transfers, refunds and rules.
