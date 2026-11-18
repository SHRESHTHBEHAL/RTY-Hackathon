/**
 * Object types from context.md section 8, kept local to the dashboard so it
 * builds without @gaitway/sdk. Field names are the wire names.
 */

export type Micros = string; // digits only (Transaction.amountMicros may start with "-")
export type Env = "test" | "live";

export type Account = {
  id: string;
  email: string;
  name: string;
  kind: "business" | "seller";
  businessId: string | null;
  sellerId: string | null;
};

export type Agent = {
  id: string;
  name: string;
  walletId: string;
  status: "active" | "disabled";
  createdAt: string;
};

export type Wallet = {
  walletId: string;
  agentId: string;
  availableMicros: Micros;
  heldMicros: Micros;
};

export type Credential = {
  id: string;
  sellerId: string;
  agentId: string;
  businessId: string;
  maxMicros: Micros;
  remainingMicros: Micros;
  status: "active" | "released" | "expired" | "exhausted";
  expiresAt: string;
  token?: string; // only on creation
};

export type Charge = {
  id: string;
  credentialId: string | null;
  mandateId: string | null;
  sellerId: string;
  agentId: string;
  amountMicros: Micros;
  feeMicros: Micros;
  refundedMicros: Micros;
  description: string | null;
  createdAt: string;
};

export type Topup = {
  id: string;
  amountMicros: Micros;
  method: "test" | "ramp";
  status: "pending" | "confirmed" | "failed";
  txHash: string | null;
  createdAt: string;
};

export type Payout = {
  id: string;
  sellerId: string;
  amountMicros: Micros;
  status: "pending" | "sent";
  txHash: string | null;
  createdAt: string;
};

/**
 * In fixture mode the sign convention is: topup +, withdrawal -, allocation
 * + into a wallet / - out of it, hold - and release + (moves between the
 * wallet's available and held balances), charge - (paid out of held),
 * refund +.
 */
export type Transaction = {
  id: string;
  type: "topup" | "allocation" | "hold" | "release" | "charge" | "refund" | "withdrawal";
  walletId: string | null;
  amountMicros: string;
  counterparty: string | null;
  createdAt: string;
};

export type Service = {
  id: string;
  sellerId: string;
  name: string;
  description: string;
  priceNote: string;
  url: string;
  active: boolean;
};

export type Seller = { id: string; name: string; services: Service[] };

export type ApiKey = { id: string; label: string; lastFour: string; createdAt: string };

// M2
export type Rules = {
  perPaymentMaxMicros: Micros | null;
  dailyMaxMicros: Micros | null;
  allowedSellerIds: string[] | null;
};

export type Mandate = {
  id: string;
  walletId: string;
  agentId: string;
  sellerId: string;
  maxPerPeriodMicros: Micros;
  period: "day" | "week" | "month";
  status: "active" | "revoked";
  createdAt: string;
  token?: string;
};

export type Refund = { id: string; chargeId: string; amountMicros: Micros; createdAt: string };

export type Withdrawal = {
  id: string;
  amountMicros: Micros;
  status: "pending" | "sent";
  txHash: string | null;
  createdAt: string;
};

export type List<T> = { data: T[]; nextCursor: string | null };
export type ListParams = { cursor?: string; limit?: number };

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "insufficient_funds"
  | "credential_expired"
  | "credential_not_active"
  | "amount_exceeds_remaining"
  | "idempotency_conflict"
  | "rule_violation"
  | "insufficient_seller_balance"
  | "live_disabled"
  // client-side only
  | "network_error"
  | "timeout"
  | "bad_response";

export type ErrorBody = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};

export type Jwks = { keys: Array<Record<string, unknown>> };
