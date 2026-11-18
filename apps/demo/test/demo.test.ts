import { afterEach, describe, expect, it } from "vitest";
import { startMockGaitway, type MockGaitway } from "@gaitway/sdk/testing";
import { startRelay } from "../src/relay.js";
import { runAgent } from "../src/agent.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function setup() {
  const mock: MockGaitway = await startMockGaitway();
  closers.push(() => mock.close());
  const biz = mock.addBusiness({ name: "Acme Ops" });
  const seller = mock.addSeller({ name: "Relay" });
  const relay = await startRelay({ port: 0, apiBase: mock.url, sellerId: seller.id, sellerKey: seller.apiKey });
  closers.push(() => relay.close());
  return { mock, biz, seller, relay };
}

describe("demo", () => {
  it("a funded agent pays one cent per message", async () => {
    const { mock, biz, seller, relay } = await setup();
    const agent = mock.addAgent(biz.id, "500000", "Scout");
    const before = mock.wallet(agent.id);
    const r = await runAgent({ apiBase: mock.url, agentKey: agent.apiKey, relayUrl: relay.url, count: 5, name: "Scout" });
    expect(r).toEqual({ sent: 5, failed: false });
    const after = mock.wallet(agent.id);
    const fell =
      BigInt(before.availableMicros) + BigInt(before.heldMicros) -
      (BigInt(after.availableMicros) + BigInt(after.heldMicros));
    expect(fell.toString()).toBe("50000");
    expect(mock.sellerBalance(seller.id).owedMicros).toBe("50000");
    const msgs = await (await fetch(`${relay.url}/messages`)).json();
    expect(msgs.messages).toHaveLength(5);
    expect(msgs.messages[0].from).toBe("Scout");
  });

  it("an agent with an empty wallet is refused and Relay stores nothing", async () => {
    const { mock, biz, seller, relay } = await setup();
    const agent = mock.addAgent(biz.id, "0", "Broke");
    const r = await runAgent({ apiBase: mock.url, agentKey: agent.apiKey, relayUrl: relay.url, count: 3, name: "Broke" });
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(true);
    expect(r.reason).toBe("insufficient_funds");
    const msgs = await (await fetch(`${relay.url}/messages`)).json();
    expect(msgs.messages).toHaveLength(0);
    expect(mock.sellerBalance(seller.id).owedMicros).toBe("0");
  });
});
