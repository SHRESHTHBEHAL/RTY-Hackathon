/**
 * Code shown on the public site, copied verbatim from packages/sdk/README.md
 * and packages/mcp/README.md. Update those READMEs first, then these.
 */

export const SELLER_SNIPPET = `import express from "express";
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
app.listen(3000);`;

export const AGENT_SNIPPET = `import { GaitwayAgent } from "@gaitway/sdk";

const agent = new GaitwayAgent({ apiKey: process.env.GAITWAY_AGENT_KEY!, baseUrl: "http://localhost:8787" });
const res = await agent.fetch("http://localhost:3000/relay", {
  method: "POST",
  body: JSON.stringify({ text: "hello" }),
});
console.log(res.status, await agent.payments());
await agent.releaseAll(); // return unspent holds to the balance`;

export const INSTALL_SNIPPET = `pnpm add @gaitway/sdk`;

export const MCP_SNIPPET = `claude mcp add gaitway \\
  --env GAITWAY_AGENT_KEY=gw_test_agt_... \\
  --env GAITWAY_API_BASE=http://localhost:8787 \\
  --env GAITWAY_MAX_SESSION_DOLLARS=5 \\
  -- node /path/to/Gaitway/packages/mcp/dist/main.js`;

export const MCP_JSON_SNIPPET = `{
  "mcpServers": {
    "gaitway": {
      "command": "node",
      "args": ["/path/to/Gaitway/packages/mcp/dist/main.js"],
      "env": {
        "GAITWAY_AGENT_KEY": "gw_test_agt_...",
        "GAITWAY_API_BASE": "http://localhost:8787",
        "GAITWAY_MAX_SESSION_DOLLARS": "5"
      }
    }
  }
}`;

export const MCP_TOOLS: Array<{ name: string; inputs: string; does: string }> = [
  { name: "gaitway_balance", inputs: "none", does: "Available and held balance, in dollars." },
  { name: "gaitway_find_sellers", inputs: "query", does: "Directory search: seller ids, services, price notes, URLs." },
  {
    name: "gaitway_paid_request",
    inputs: "url, method, body?, max_dollars?",
    does: "Calls the URL. On a Gaitway 402 it opens a spending session for that seller, pays, and retries once.",
  },
  { name: "gaitway_pay_seller", inputs: "seller_id, dollars, reference?", does: "Pays a seller directly, without calling their API." },
  { name: "gaitway_payments", inputs: "none", does: "Recent payments, newest first (up to 50)." },
];

export const MANDATE_SNIPPET = `// Agent
const mandate = await agent.createMandate({ sellerId, maxPerPeriodMicros: usd("20"), period: "month" });
// send mandate.token to the seller in the \`gaitway-mandate\` header

// Seller
const claims = await seller.verifyMandate(req.get("gaitway-mandate")!); // throws GaitwayError "invalid_mandate"
const charge = await seller.chargeMandate({ mandateId: claims.mandateId, amountMicros: usd("5"), description: "May plan" });`;

export const TRANSFER_SNIPPET = `const charge = await agent.transfer({ sellerId, amountMicros: usd("12.50"), reference: "invoice 42" });`;

export const REFUND_SNIPPET = `await seller.refund({ chargeId: charge.id });                         // everything not yet refunded
await seller.refund({ chargeId: charge.id, amountMicros: usd("1") }); // part of it`;

export const WEBHOOK_SNIPPET = `import { verifyWebhook } from "@gaitway/sdk";

app.post("/gaitway/webhook", express.text({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.get("gaitway-signature") ?? "", process.env.GAITWAY_WEBHOOK_SECRET!);
  // event.type: "payout.sent" | "charge.refunded" | "mandate.revoked"
  res.sendStatus(200);
});`;

export const FIND_SELLERS_SNIPPET = `const sellers = await agent.findSellers("translation"); // Seller[] with their active services
const one = await agent.getSeller("sel_...");`;

/** context.md section 7 */
export const PAYMENT_REQUIRED_SNIPPET = `{
  "error": { "code": "payment_required", "message": "Pay with Gaitway" },
  "gaitway": {
    "sellerId": "sel_…",
    "priceMicros": "10000",
    "priceNote": "per message",
    "apiBase": "http://localhost:8787"
  }
}`;

/** context.md section 8 */
export const POLICY_REQUEST_SNIPPET = `{ "id": "evt_…", "type": "credential", "agentId": "agt_…", "walletId": "wal_…",
  "sellerId": "sel_…", "amountMicros": "10000", "createdAt": "2026-11-18T10:00:00Z" }`;

export const POLICY_RESPONSE_SNIPPET = `{ "outcome": "allow", "reasons": [], "approvalLink": null }`;

export const ERROR_BODY_SNIPPET = `{ "error": { "code": "insufficient_funds", "message": "Human-readable text" } }`;

export const WEBHOOK_BODY_SNIPPET = `{ "id": "evt_…", "type": "payout.sent", "createdAt": "…", "data": { … } }`;
