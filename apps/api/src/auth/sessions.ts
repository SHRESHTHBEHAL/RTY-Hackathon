import { createHmac, timingSafeEqual } from "node:crypto";

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

/** `gws_<payload>.<hmac>`; payload is base64url JSON { a: accountId, e: expiry ms }. */
export function createSessionToken(accountId: string, secret: string, now: Date): string {
  const payload = Buffer.from(JSON.stringify({ a: accountId, e: now.getTime() + SEVEN_DAYS_MS })).toString("base64url");
  return `gws_${payload}.${sign(payload, secret)}`;
}

/** Returns the account ID, or null if the token is malformed, forged, or expired. */
export function verifySessionToken(token: string, secret: string, now: Date): string | null {
  if (!token.startsWith("gws_")) return null;
  const [payload, sig] = token.slice(4).split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { a?: unknown; e?: unknown };
    if (typeof p.a !== "string" || typeof p.e !== "number" || p.e <= now.getTime()) return null;
    return p.a;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
