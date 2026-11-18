import type { Wallet } from "@/lib/api/types";

/** Plain data helpers for the ledger, usable from server components. */

export type WalletBalance = { available: string; held: string };
export type LedgerState = { unallocated: string; wallets: Record<string, WalletBalance> };

export function ledgerFrom(unallocatedMicros: string, wallets: Wallet[]): LedgerState {
  return {
    unallocated: unallocatedMicros,
    wallets: Object.fromEntries(wallets.map((w) => [w.walletId, { available: w.availableMicros, held: w.heldMicros }])),
  };
}
