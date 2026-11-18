// Object types, verbatim from context.md section 8.
export type Micros = string; // digits only
export type Env = "test" | "live";

export type Account = { id: string; email: string; name: string;
  kind: "business" | "seller"; businessId: string | null; sellerId: string | null };

export type Agent = { id: string; name: string; walletId: string;
  status: "active" | "disabled"; createdAt: string };

export type Wallet = { walletId: string; agentId: string;
  availableMicros: Micros; heldMicros: Micros };

export type Credential = { id: string; sellerId: string; agentId: string; businessId: string;
  maxMicros: Micros; remainingMicros: Micros;
  status: "active" | "released" | "expired" | "exhausted";
  expiresAt: string; token?: string /* only on creation */ };

export type Charge = { id: string; credentialId: string | null; mandateId: string | null;
  sellerId: string; agentId: string; amountMicros: Micros; feeMicros: Micros;
  refundedMicros: Micros; description: string | null; createdAt: string };

export type Topup = { id: string; amountMicros: Micros; method: "test" | "ramp";
  status: "pending" | "confirmed" | "failed"; txHash: string | null; createdAt: string };

export type Payout = { id: string; sellerId: string; amountMicros: Micros;
  status: "pending" | "sent"; txHash: string | null; createdAt: string };

export type Transaction = { id: string;
  type: "topup" | "allocation" | "hold" | "release" | "charge" | "refund" | "withdrawal";
  walletId: string | null; amountMicros: string /* may start with "-" */;
  counterparty: string | null; createdAt: string };

export type Service = { id: string; sellerId: string; name: string; description: string;
  priceNote: string; url: string; active: boolean };

export type Seller = { id: string; name: string; services: Service[] };

export type ApiKey = { id: string; label: string; lastFour: string; createdAt: string };

// M2
export type Rules = { perPaymentMaxMicros: Micros | null; dailyMaxMicros: Micros | null;
  allowedSellerIds: string[] | null };
export type Mandate = { id: string; walletId: string; agentId: string; sellerId: string;
  maxPerPeriodMicros: Micros; period: "day" | "week" | "month";
  status: "active" | "revoked"; createdAt: string; token?: string };
export type Refund = { id: string; chargeId: string; amountMicros: Micros; createdAt: string };
export type Withdrawal = { id: string; amountMicros: Micros;
  status: "pending" | "sent"; txHash: string | null; createdAt: string };

/** List route envelope. */
export type Page<T> = { data: T[]; nextCursor: string | null };

/** Error body shape for every non-2xx response. */
export type ErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Body of the HTTP 402 a seller sends when there is no valid credential (context.md section 7). */
export type PaymentRequiredBody = {
  error: { code: "payment_required"; message: string };
  gaitway: { sellerId: string; priceMicros: Micros | null; priceNote: string | null; apiBase: string };
};
