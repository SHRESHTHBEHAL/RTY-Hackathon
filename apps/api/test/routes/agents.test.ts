import { describe, expect, it } from "vitest";
import { setup, type Ctx } from "../helpers.js";

export async function signup(call: Ctx["call"], email: string, kind: "business" | "seller" = "business", name = "Acme") {
  const r = await call("POST", "/v1/accounts", { body: { email, password: "password1", name, kind } });
  if (r.status !== 200) throw new Error(`signup failed: ${r.text}`);
  return r.body as { account: any; sessionToken: string; apiKey: string };
}

describe("agents and wallets", () => {
  it("creates an agent with a wallet and key", async () => {
    const { call } = await setup();
    const b = await signup(call, "b@x.test");
    const r = await call("POST", "/v1/agents", { token: b.apiKey, body: { name: "Scout" } });
    expect(r.status).toBe(200);
    expect(r.body.agent).toMatchObject({ name: "Scout", status: "active" });
    expect(r.body.agent.id).toMatch(/^agt_/);
    expect(r.body.agent.walletId).toMatch(/^wal_/);
    expect(typeof r.body.agent.createdAt).toBe("string");
    expect(r.body.apiKey).toMatch(/^gw_test_agt_[0-9a-z]{32}$/);

    const g = await call("GET", `/v1/agents/${r.body.agent.id}`, { token: b.sessionToken });
    expect(g.body.wallet).toEqual({ walletId: r.body.agent.walletId, agentId: r.body.agent.id, availableMicros: "0", heldMicros: "0" });

    const list = await call("GET", "/v1/agents", { token: b.apiKey });
    expect(list.body.data.map((a: any) => a.id)).toEqual([r.body.agent.id]);

    const w = await call("GET", "/v1/wallet", { token: r.body.apiKey });
    expect(w.body.wallet.walletId).toBe(r.body.agent.walletId);
  });

  it("isolates businesses", async () => {
    const { call } = await setup();
    const b1 = await signup(call, "b1@x.test");
    const b2 = await signup(call, "b2@x.test");
    const a = await call("POST", "/v1/agents", { token: b1.apiKey, body: { name: "A" } });
    const g = await call("GET", `/v1/agents/${a.body.agent.id}`, { token: b2.apiKey });
    expect(g.status).toBe(404);
    const p = await call("PATCH", `/v1/agents/${a.body.agent.id}`, { token: b2.apiKey, body: { name: "x" } });
    expect(p.status).toBe(404);
    const k = await call("GET", `/v1/agents/${a.body.agent.id}/keys`, { token: b2.apiKey });
    expect(k.status).toBe(404);
  });

  it("patch persists; agent keys create/list/delete", async () => {
    const { call } = await setup();
    const b = await signup(call, "b@x.test");
    const a = await call("POST", "/v1/agents", { token: b.apiKey, body: { name: "A" } });
    const id = a.body.agent.id;
    const p = await call("PATCH", `/v1/agents/${id}`, { token: b.apiKey, body: { status: "disabled", name: "B" } });
    expect(p.body.agent).toMatchObject({ status: "disabled", name: "B" });
    const g = await call("GET", `/v1/agents/${id}`, { token: b.apiKey });
    expect(g.body.agent.status).toBe("disabled");
    const bad = await call("PATCH", `/v1/agents/${id}`, { token: b.apiKey, body: { status: "gone" } });
    expect(bad.status).toBe(422);

    const k = await call("POST", `/v1/agents/${id}/keys`, { token: b.apiKey, body: { label: "second" } });
    expect(k.body.apiKey).toMatch(/^gw_test_agt_/);
    expect(k.body.key.label).toBe("second");
    const list = await call("GET", `/v1/agents/${id}/keys`, { token: b.apiKey });
    expect(list.body.data.length).toBe(2);
    const d = await call("DELETE", `/v1/agents/${id}/keys/${k.body.key.id}`, { token: b.apiKey });
    expect(d.body).toEqual({ ok: true });
    const w = await call("GET", "/v1/wallet", { token: k.body.apiKey });
    expect(w.status).toBe(401);
    const w2 = await call("GET", "/v1/wallet", { token: a.body.apiKey });
    expect(w2.status).toBe(200);
  });

  it("agent keys cannot use business routes", async () => {
    const { call } = await setup();
    const b = await signup(call, "b@x.test");
    const a = await call("POST", "/v1/agents", { token: b.apiKey, body: { name: "A" } });
    const r = await call("GET", "/v1/agents", { token: a.body.apiKey });
    expect(r.status).toBe(403);
  });
});
