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

## Testing

`@gaitway/sdk/testing` exports `startMockGaitway()`, an in-memory API for tests and local work.
