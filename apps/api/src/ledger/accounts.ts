import type { AccountRef } from "./ledger.js";

/** Naming helpers for ledger accounts (see the ledger model in the WS2 plan). */
export const acct = {
  external: (): AccountRef => ({ kind: "external", ownerId: "vault" }),
  unallocated: (businessId: string): AccountRef => ({ kind: "unallocated", ownerId: businessId }),
  available: (walletId: string): AccountRef => ({ kind: "available", ownerId: walletId }),
  held: (walletId: string): AccountRef => ({ kind: "held", ownerId: walletId }),
  owed: (sellerId: string): AccountRef => ({ kind: "owed", ownerId: sellerId }),
  fees: (): AccountRef => ({ kind: "fees", ownerId: "gaitway" }),
  settling: (batchId: string): AccountRef => ({ kind: "settling", ownerId: batchId }),
};
