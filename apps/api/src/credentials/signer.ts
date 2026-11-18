import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK, type KeyLike } from "jose";
import type { Deps } from "../deps.js";
import { randomBase36 } from "../ids.js";

export type Signer = { kid: string; privateKey: KeyLike | Uint8Array; publicJwk: JWK };

const cache = new WeakMap<Deps, Promise<Signer>>();

/**
 * One ES256 key pair, generated on first use and stored in signing_keys so
 * every app instance on the same database signs with the same kid.
 */
export function getSigner(deps: Deps): Promise<Signer> {
  let p = cache.get(deps);
  if (!p) {
    p = loadOrCreate(deps).catch((e) => {
      cache.delete(deps);
      throw e;
    });
    cache.set(deps, p);
  }
  return p;
}

async function loadOrCreate(deps: Deps): Promise<Signer> {
  const { sql } = deps;
  let [row] = await sql<{ kid: string; private_jwk: JWK; public_jwk: JWK }[]>`select * from signing_keys where id = 'primary'`;
  if (!row) {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const kid = `gw_${randomBase36(16)}`;
    const priv = await exportJWK(privateKey);
    const pub = await exportJWK(publicKey);
    await sql`insert into signing_keys (id, kid, private_jwk, public_jwk)
              values ('primary', ${kid}, ${sql.json(priv as never)}, ${sql.json(pub as never)})
              on conflict (id) do nothing`;
    [row] = await sql<{ kid: string; private_jwk: JWK; public_jwk: JWK }[]>`select * from signing_keys where id = 'primary'`;
  }
  return { kid: row!.kid, privateKey: await importJWK(row!.private_jwk, "ES256"), publicJwk: row!.public_jwk };
}

export async function signToken(
  deps: Deps,
  typ: string,
  claims: Record<string, unknown> & { sub: string; aud: string; jti: string; iat: number; exp: number },
): Promise<string> {
  const s = await getSigner(deps);
  const { sub, aud, jti, iat, exp, ...rest } = claims;
  return new SignJWT(rest)
    .setProtectedHeader({ alg: "ES256", kid: s.kid, typ })
    .setIssuer(deps.config.issuer)
    .setSubject(sub)
    .setAudience(aud)
    .setJti(jti)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(s.privateKey);
}
