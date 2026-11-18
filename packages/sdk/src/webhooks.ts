// Seller webhooks (context.md section 8): body `{ id, type, createdAt, data }`, header
// `gaitway-signature` = hex HMAC-SHA256 of the raw body using the webhook secret.
import { createHmac, timingSafeEqual } from "node:crypto";
import { GaitwayError } from "./http.js";

export type WebhookEventType = "payout.sent" | "charge.refunded" | "mandate.revoked";

export type WebhookEvent = {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  data: Record<string, unknown>;
};

/** Name of the header that carries the signature. */
export const WEBHOOK_SIGNATURE_HEADER = "gaitway-signature";

const HEX_SHA256 = /^[0-9a-f]{64}$/i;
const invalid = () => new GaitwayError("invalid_signature", "Webhook signature does not match", 401);

/**
 * Check a webhook's signature against the raw request body (exactly as received, before any
 * JSON parsing) and return the parsed event. Throws GaitwayError `invalid_signature` on any
 * mismatch; the comparison is constant-time.
 */
export function verifyWebhook(rawBody: string, signature: string, secret: string): WebhookEvent {
  if (typeof rawBody !== "string" || typeof signature !== "string" || typeof secret !== "string" || !secret) {
    throw invalid();
  }
  const sig = signature.trim();
  if (!HEX_SHA256.test(sig)) throw invalid();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid();

  let ev: unknown;
  try {
    ev = JSON.parse(rawBody);
  } catch {
    throw new GaitwayError("validation_failed", "Webhook body is not valid JSON");
  }
  const e = ev as Partial<WebhookEvent> | null;
  if (
    !e || typeof e !== "object" || typeof e.id !== "string" || typeof e.type !== "string" ||
    typeof e.createdAt !== "string" || typeof e.data !== "object" || e.data === null
  ) {
    throw new GaitwayError("validation_failed", "Webhook body is not a Gaitway event");
  }
  return e as WebhookEvent;
}
