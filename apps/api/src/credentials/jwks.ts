import type { App } from "../app.js";
import type { Deps } from "../deps.js";
import { getSigner } from "./signer.js";

export function registerJwks(app: App, deps: Deps) {
  app.get("/.well-known/jwks.json", async (c) => {
    const s = await getSigner(deps);
    const { kty, crv, x, y } = s.publicJwk;
    c.header("cache-control", "public, max-age=300");
    return c.json({ keys: [{ kty, crv, x, y, kid: s.kid, alg: "ES256", use: "sig" }] });
  });
}
