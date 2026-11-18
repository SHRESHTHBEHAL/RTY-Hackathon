import { describe, expect, it } from "vitest";
import { ApiError } from "../src/errors.js";
import { setup } from "./helpers.js";

describe("app basics", () => {
  it("GET /health", async () => {
    const { call } = await setup();
    const r = await call("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it("unknown route is 404 not_found", async () => {
    const { call } = await setup();
    const r = await call("GET", "/v1/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("not_found");
    expect(typeof r.body.error.message).toBe("string");
  });

  it("ApiError maps to its status; plain Error is 500 internal without stack", async () => {
    const { app } = await setup();
    app.get("/__t/funds", () => {
      throw new ApiError("insufficient_funds");
    });
    app.get("/__t/boom", () => {
      throw new Error("secret internals at foo.ts:12");
    });
    const a = await app.request("/__t/funds");
    expect(a.status).toBe(402);
    expect((await a.json()).error.code).toBe("insufficient_funds");
    const b = await app.request("/__t/boom");
    expect(b.status).toBe(500);
    const text = await b.text();
    expect(JSON.parse(text).error.code).toBe("internal");
    expect(text).not.toContain("foo.ts");
  });

  it("live keys are refused with live_disabled", async () => {
    const { call } = await setup();
    const r = await call("GET", "/v1/me", { token: "gw_live_biz_" + "a".repeat(32) });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("live_disabled");
  });
});
