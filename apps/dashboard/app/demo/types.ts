/** What the presentation screen's server code hands the browser. No keys, no tokens. */
import type { Rules, Transaction } from "@/lib/api/types";

export type DemoAgent = {
  slot: number;
  id: string;
  name: string;
  walletId: string;
  status: "active" | "disabled";
  availableMicros: string;
  heldMicros: string;
  rules: Rules | null;
};

export type DemoFeedItem = {
  id: string;
  kind: Transaction["type"];
  agentId: string | null;
  agentName: string | null;
  amountMicros: string;
  counterparty: string | null;
  createdAt: string;
};

export type DemoCharge = {
  id: string;
  agentId: string;
  agentName: string | null;
  amountMicros: string;
  description: string | null;
  createdAt: string;
};

export type DemoPayout = { id: string; amountMicros: string; status: "pending" | "sent"; createdAt: string };

export type DemoSnapshot = {
  /** Server clock when the snapshot was read; the screen never applies an older one over a newer one. */
  serverTime: number;
  mode: "fixtures" | "live";
  businessName: string;
  unallocatedMicros: string;
  agents: DemoAgent[];
  seller: { id: string; name: string; owedMicros: string; paidOutMicros: string; priceNote: string | null };
  charges: DemoCharge[];
  payouts: DemoPayout[];
  feed: DemoFeedItem[];
};

export type DemoRefusal = { code: string; sign: string; message: string };

export type DemoResult<T = object> =
  | ({ ok: true; snapshot: DemoSnapshot | null } & T)
  | { ok: false; refusal: DemoRefusal; snapshot: DemoSnapshot | null };
