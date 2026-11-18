// The Gaitway demo (context.md section 11). With no settings it starts the SDK's mock API itself.
import { GaitwayAgent, formatUsd } from "@gaitway/sdk";
import { startMockGaitway, type MockGaitway } from "@gaitway/sdk/testing";
import { startRelay } from "./relay.js";
import { runAgent } from "./agent.js";

const say = (line = "") => console.log(line);
const usdM = (n: number) => String(n * 1_000_000);

type Cast = { name: string; key: string };

async function main() {
  const env = process.env;
  const live = env.GAITWAY_API_BASE && env.DEMO_SELLER_KEY && env.DEMO_SELLER_ID && env.DEMO_AGENT_KEYS;
  let mock: MockGaitway | undefined;
  let apiBase: string;
  let sellerId: string;
  let sellerKey: string;
  let agents: Cast[];
  let balanceOf: (a: Cast) => Promise<bigint>;
  let owed: () => Promise<bigint>;

  if (live) {
    apiBase = env.GAITWAY_API_BASE!;
    sellerId = env.DEMO_SELLER_ID!;
    sellerKey = env.DEMO_SELLER_KEY!;
    const names = ["Scout", "Buyer", "Broke"];
    agents = env.DEMO_AGENT_KEYS!.split(",").map((k, i) => ({ name: names[i] ?? `Agent ${i + 1}`, key: k.trim() }));
    say(`Using the Gaitway API at ${apiBase}.`);
    balanceOf = async (a) => {
      const w = await new GaitwayAgent({ apiKey: a.key, baseUrl: apiBase }).balance();
      return BigInt(w.availableMicros) + BigInt(w.heldMicros);
    };
    owed = async () => {
      const res = await fetch(`${apiBase}/v1/seller/balance`, { headers: { authorization: `Bearer ${sellerKey}` } });
      return BigInt(((await res.json()) as { owedMicros: string }).owedMicros);
    };
  } else {
    mock = await startMockGaitway();
    apiBase = mock.url;
    say("No API settings found, so the demo runs against Gaitway's built-in test API.");
    const biz = mock.addBusiness({ name: "Acme Ops" });
    const seller = mock.addSeller({ name: "Relay" });
    sellerId = seller.id;
    sellerKey = seller.apiKey;
    const made = [
      mock.addAgent(biz.id, usdM(50), "Scout"),
      mock.addAgent(biz.id, usdM(30), "Buyer"),
      mock.addAgent(biz.id, "0", "Broke"),
    ];
    agents = made.map((a) => ({ name: a.name, key: a.apiKey }));
    const ids = new Map(made.map((a) => [a.apiKey, a.id]));
    balanceOf = async (a) => {
      const w = mock!.wallet(ids.get(a.key)!);
      return BigInt(w.availableMicros) + BigInt(w.heldMicros);
    };
    const sid = seller.id;
    owed = async () => BigInt(mock!.sellerBalance(sid).owedMicros);
  }

  const relay = await startRelay({ port: 0, apiBase, sellerId, sellerKey });
  try {
    const balances = async () => {
      const parts: string[] = [];
      for (const a of agents) parts.push(`${a.name} ${formatUsd(await balanceOf(a))}`);
      return `Balances: ${parts.join(", ")}. Relay is owed ${formatUsd(await owed())}.`;
    };

    say();
    say("Step 1. Acme Ops, a business, has three agents with their own wallets.");
    say(await balances());

    say();
    say("Step 2. Relay is a messaging service that charges one cent per message. Without Gaitway, an agent just asks:");
    const bare = await fetch(`${relay.url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "ops@example.test", text: "hello" }),
    });
    say(`Relay answers ${bare.status} ${bare.status === 402 ? "Payment Required" : bare.statusText}, and stores nothing.`);
    say(await balances());

    const [scout, buyer, broke] = agents as [Cast, Cast, Cast];
    const log = (line: string) => say(`  ${line}`);

    say();
    say("Step 3. Scout uses the Gaitway SDK. It pays automatically and sends five messages.");
    const r1 = await runAgent({ apiBase, agentKey: scout.key, relayUrl: relay.url, count: 5, name: scout.name, log });
    say(`Scout sent ${r1.sent} messages. Each cost one cent.`);
    say(await balances());

    say();
    say("Step 4. Buyer sends three messages.");
    const r2 = await runAgent({ apiBase, agentKey: buyer.key, relayUrl: relay.url, count: 3, name: buyer.name, log });
    say(`Buyer sent ${r2.sent} messages.`);
    say(await balances());

    say();
    say("Step 5. Broke has an empty wallet and tries to send a message.");
    const r3 = await runAgent({ apiBase, agentKey: broke.key, relayUrl: relay.url, count: 1, name: broke.name, log });
    say(
      r3.failed
        ? `Broke was refused (${r3.reason}): not enough balance. Nothing was sent and nothing was charged.`
        : "Unexpected: Broke was able to send.",
    );
    say(await balances());

    const stored = (await (await fetch(`${relay.url}/messages`)).json()) as { messages: unknown[] };
    say();
    say(`Relay stored ${stored.messages.length} messages in total, all from agents that paid.`);
    if (r1.sent !== 5 || r2.sent !== 3 || !r3.failed || stored.messages.length !== 8) {
      throw new Error("The demo did not go as expected");
    }
    say("Demo complete");
  } finally {
    await relay.close();
    await mock?.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
