// Express middleware for sellers: verify the credential, charge, then run the handler.
// Imported from "@gaitway/sdk/express". Uses Express types only; never loads express at runtime.
import type { RequestHandler } from "express";
import { GaitwayError } from "./http.js";
import type { Charge } from "./types.js";
import type { CredentialClaims, GaitwaySeller } from "./seller.js";

export type GaitwayRequestContext = { claims: CredentialClaims; charge: Charge; remainingMicros: string };

export type GaitwayExpressOptions = { priceMicros: string; priceNote?: string; description?: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by gaitwayExpress once the request has been paid for. */
      gaitway?: GaitwayRequestContext;
    }
  }
}

/** Header the agent presents its credential in (context.md section 2). */
export const TOKEN_HEADER = "gaitway-token";
/** Header carrying the agent's per-logical-request ID (context.md section 7). */
export const REQUEST_ID_HEADER = "gaitway-request-id";

/** Charge refusals that mean "this credential cannot pay for this": answered with 402. */
const REFUSALS = new Set([
  "invalid_credential",
  "amount_exceeds_remaining",
  "credential_expired",
  "credential_not_active",
  "insufficient_funds",
  "rule_violation",
  "not_found",
]);

export function gaitwayExpress(seller: GaitwaySeller, opts: GaitwayExpressOptions): RequestHandler {
  if (!opts || typeof opts.priceMicros !== "string" || !/^\d+$/.test(opts.priceMicros) || BigInt(opts.priceMicros) <= 0n) {
    throw new TypeError("gaitwayExpress: priceMicros must be a positive whole number of micros as a string");
  }
  const required = seller.paymentRequired({ priceMicros: opts.priceMicros, priceNote: opts.priceNote });

  return async (req, res, next) => {
    let context: GaitwayRequestContext;
    try {
      const token = req.get(TOKEN_HEADER);
      if (!token) {
        res.status(required.status).json(required.body);
        return;
      }
      const claims = await seller.verify(token);
      const requestId = req.get(REQUEST_ID_HEADER);
      const { charge, remainingMicros } = await seller.charge({
        credentialId: claims.credentialId,
        amountMicros: opts.priceMicros,
        ...(opts.description !== undefined ? { description: opts.description } : {}),
        ...(requestId && requestId.length <= 255 ? { idempotencyKey: requestId } : {}),
      });
      context = { claims, charge, remainingMicros };
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof GaitwayError && REFUSALS.has(err.code)) {
        res.status(required.status).json(required.body);
        return;
      }
      if (err instanceof GaitwayError && err.code === "idempotency_conflict") {
        res.status(409).json({ error: { code: err.code, message: err.message } });
        return;
      }
      res.status(502).json({
        error: { code: "upstream_error", message: "Could not complete payment with Gaitway; try again" },
      });
      return;
    }
    req.gaitway = context;
    // Outside the try: a handler failure must not be reported as a payment failure.
    next();
  };
}
