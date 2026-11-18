import { describe, expect, it } from "vitest";
import { setup } from "../helpers.js";

const biz = { email: "a@biz.test", password: "password1", name: "Acme", kind: "business" };

describe("accounts and sessions", () => {
  it("creates a business account with session and key", async () => {
    const { call } = await setup();
    const r = await call("POST", "/v1/accounts", { body: biz });
    expect(r.status).toBe(200);
    expect(r.body.account).toMatchObject({ email: "a@biz.test", name: "Acme", kind: "business", sellerId: null });
    expect(r.body.account.id).toMatch(/^acc_[0-9a-z]{24}$/);
    expect(r.body.account.businessId).toMatch(/^biz_[0-9a-z]{24}$/);
    expect(r.body.sessionToken).toMatch(/^gws_/);
    expect(r.body.apiKey).toMatch(/^gw_test_biz_[0-9a-z]{32}$/);
  });

  it("creates a seller account", async () => {
    const { call } = await setup();
    const r = await call("POST", "/v1/accounts", { body: { ...biz, kind: "seller", name: "Relay" } });
    expect(r.status).toBe(200);
    expect(r.body.account.sellerId).toMatch(/^sel_/);
    expect(r.body.account.businessId).toBeNull();
    expect(r.body.apiKey).toMatch(/^gw_test_sel_[0-9a-z]{32}$/);
  });

  it("rejects duplicate email and short password", async () => {
    const { call } = await setup();
    await call("POST", "/v1/accounts", { body: biz });
    const dup = await call("POST", "/v1/accounts", { body: { ...biz, email: "A@BIZ.test" } });
    expect(dup.status).toBe(422);
    expect(dup.body.error.code).toBe("validation_failed");
    const short = await call("POST", "/v1/accounts", { body: { ...biz, email: "b@biz.test", password: "1234567" } });
    expect(short.body.error.code).toBe("validation_failed");
  });

  it("sessions: right and wrong password", async () => {
    const { call } = await setup();
    await call("POST", "/v1/accounts", { body: biz });
    const ok = await call("POST", "/v1/sessions", { body: { email: biz.email, password: biz.password } });
    expect(ok.status).toBe(200);
    expect(ok.body.sessionToken).toMatch(/^gws_/);
    expect(ok.body.account.email).toBe(biz.email);
    const bad = await call("POST", "/v1/sessions", { body: { email: biz.email, password: "wrongpass" } });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("unauthorized");
  });

  it("GET /v1/me works with session and with key", async () => {
    const { call } = await setup();
    const a = await call("POST", "/v1/accounts", { body: biz });
    const s = await call("GET", "/v1/me", { token: a.body.sessionToken });
    expect(s.body.account.id).toBe(a.body.account.id);
    const k = await call("GET", "/v1/me", { token: a.body.apiKey });
    expect(k.body.account.id).toBe(a.body.account.id);
    const none = await call("GET", "/v1/me");
    expect(none.status).toBe(401);
    const tampered = await call("GET", "/v1/me", { token: a.body.sessionToken.slice(0, -2) + "xx" });
    expect(tampered.status).toBe(401);
  });

  it("keys: list, create, delete; deleted key stops working; seller key on business route is forbidden", async () => {
    const { call, sql } = await setup();
    const a = await call("POST", "/v1/accounts", { body: biz });
    const created = await call("POST", "/v1/keys", { token: a.body.sessionToken, body: { label: "ci" } });
    expect(created.status).toBe(200);
    expect(created.body.key).toMatchObject({ label: "ci", lastFour: created.body.apiKey.slice(-4) });
    expect(created.body.key.id).toMatch(/^key_/);
    const list = await call("GET", "/v1/keys", { token: a.body.sessionToken });
    expect(list.body.data.length).toBe(2);
    expect(list.body.nextCursor).toBeNull();
    expect(list.text).not.toContain(created.body.apiKey);
    expect(list.body.data[0].id).toBe(created.body.key.id); // newest first
    const del = await call("DELETE", `/v1/keys/${created.body.key.id}`, { token: a.body.sessionToken });
    expect(del.body).toEqual({ ok: true });
    const after = await call("GET", "/v1/me", { token: created.body.apiKey });
    expect(after.status).toBe(401);

    const s = await call("POST", "/v1/accounts", { body: { ...biz, email: "s@x.test", kind: "seller" } });
    const forb = await call("GET", "/v1/agents", { token: s.body.apiKey });
    expect(forb.status).toBe(403);
    expect(forb.body.error.code).toBe("forbidden");
    const unauth = await call("GET", "/v1/agents");
    expect(unauth.body.error.code).toBe("unauthorized");

    const ser = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    const dump = ser(await sql`select * from api_keys`) + ser(await sql`select * from accounts`);
    expect(dump).not.toContain(a.body.apiKey);
    expect(dump).not.toContain(biz.password);
  });
});
