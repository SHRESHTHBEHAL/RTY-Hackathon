// The Gaitway payment gateway, running as its own HTTP service.
//
// This is the in-memory gateway: wallets, holds, credentials, charges,
// spending rules, transfers, subscriptions, and refunds, following
// context.md section 8. Balances reset when the process stops. The
// Postgres ledger and the link to the vault (Workspace 2) are not built.
import { writeFileSync } from "node:fs";
import { startMockGaitway } from "@gaitway/sdk/testing";
import { usd } from "@gaitway/sdk";

const port = Number(process.env.PORT ?? 8787);
const gateway = await startMockGaitway({ port });

const business = gateway.addBusiness({ name: "Acme Ops", email: "ops@acme.test" });
const relay = gateway.addSeller({ name: "Relay" });
gateway.addService(relay.id, {
  name: "Relay messaging",
  description: "Send a message through Relay.",
  priceNote: "$0.01 per message",
  url: "http://localhost:4000/messages",
});
const scout = gateway.addAgent(business.id, usd("50"), "Scout");
const buyer = gateway.addAgent(business.id, usd("30"), "Buyer");
const broke = gateway.addAgent(business.id, usd("0"), "Broke");
for (const agent of [scout, buyer, broke]) {
  gateway.setRules(agent.id, { perPaymentMaxMicros: usd("2"), dailyMaxMicros: usd("10") });
}

const env = [
  `GAITWAY_API_BASE=${gateway.url}`,
  `DEMO_SELLER_ID=${relay.id}`,
  `DEMO_SELLER_KEY=${relay.apiKey}`,
  `DEMO_AGENT_KEYS=${scout.apiKey},${buyer.apiKey},${broke.apiKey}`,
  `DEMO_RELAY_URL=http://localhost:4000`,
];
writeFileSync(new URL("../.env.demo", import.meta.url), env.join("\n") + "\n");

console.log(`Gaitway gateway listening on ${gateway.url}`);
console.log("Test money only. Balances are held in memory.\n");
console.log("Business  Acme Ops");
console.log("Seller    Relay   ", relay.id);
console.log("Agents    Scout $50.00, Buyer $30.00, Broke $0.00");
console.log("Rules     up to $2.00 per payment, $10.00 a day\n");
console.log("Test keys for this run were written to apps/gateway/.env.demo");
console.log("Try:  curl " + gateway.url + "/health");

process.on("SIGINT", async () => {
  await gateway.close();
  process.exit(0);
});
