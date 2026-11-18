import type { ErrorBody } from "./types";

/** Every failed API call throws this, in fixture and live mode alike. */
export class GaitwayError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "GaitwayError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }

  static fromBody(status: number, body: unknown): GaitwayError {
    const err = (body as Partial<ErrorBody> | null)?.error;
    if (err && typeof err.code === "string") {
      return new GaitwayError(err.code, err.message ?? err.code, status, err.details);
    }
    return new GaitwayError("bad_response", `Unexpected response (HTTP ${status})`, status);
  }

  /** Plain object, safe to return from a server action. */
  toJSON(): { code: string; message: string; status: number; details?: Record<string, unknown> } {
    return { code: this.code, message: this.message, status: this.status, details: this.details };
  }
}

export function isGaitwayError(e: unknown): e is GaitwayError {
  return e instanceof GaitwayError;
}

/**
 * Words for people, per DESIGN.md voice: what happened and what to do.
 * Screens may override with something more specific.
 */
export function humanError(e: unknown): string {
  if (!isGaitwayError(e)) return "Something went wrong. Try again.";
  switch (e.code) {
    case "unauthorized":
      return "Your session has ended. Log in again.";
    case "forbidden":
      return "This account cannot do that.";
    case "not_found":
      return "That item no longer exists.";
    case "validation_failed":
      return e.message || "Check the highlighted fields.";
    case "insufficient_funds":
      return "Not enough balance. Top up first.";
    case "credential_expired":
      return "That payment session has expired.";
    case "credential_not_active":
      return "That payment session is closed.";
    case "amount_exceeds_remaining":
      return "That is more than the session has left.";
    case "idempotency_conflict":
      return "This request was already sent with different details.";
    case "rule_violation":
      return e.message || "A spending rule blocked this payment.";
    case "insufficient_seller_balance":
      return "Not enough unsettled balance to refund that amount.";
    case "live_disabled":
      return "Live mode is not available yet.";
    case "network_error":
      return "Cannot reach Gaitway. Check your connection and try again.";
    case "timeout":
      return "Gaitway took too long to answer. Try again.";
    default:
      return e.message || "Something went wrong. Try again.";
  }
}
