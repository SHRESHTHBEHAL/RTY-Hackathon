export const ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  insufficient_funds: 402,
  credential_expired: 409,
  credential_not_active: 409,
  amount_exceeds_remaining: 409,
  idempotency_conflict: 409,
  rule_violation: 403,
  insufficient_seller_balance: 409,
  live_disabled: 403,
  rate_limited: 429,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  unauthorized: "Missing or invalid API key or session",
  forbidden: "This key or session may not do that",
  not_found: "Not found",
  validation_failed: "Invalid input",
  insufficient_funds: "Balance too low",
  credential_expired: "The credential has expired",
  credential_not_active: "The credential is no longer active",
  amount_exceeds_remaining: "Amount is larger than what remains on the credential",
  idempotency_conflict: "This Idempotency-Key was used with a different request",
  rule_violation: "A spending rule blocked this request",
  insufficient_seller_balance: "Refund is larger than the seller's unsettled balance",
  live_disabled: "Live mode is not enabled",
  rate_limited: "Too many requests; slow down",
  internal: "Internal error",
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
  get status(): number {
    return ERROR_STATUS[this.code];
  }
  toBody() {
    const error: { code: ErrorCode; message: string; details?: Record<string, unknown> } = {
      code: this.code,
      message: this.message,
    };
    if (this.details) error.details = this.details;
    return { error };
  }
}
