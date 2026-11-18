/**
 * Slot for a signed partner that converts regular currency in and out
 * (context.md section 15). No real provider exists yet.
 */
export interface RampProvider {
  createTopup(businessId: string, amountMicros: bigint): Promise<{ providerRef: string; checkoutUrl: string | null }>;
  createPayout(sellerId: string, amountMicros: bigint): Promise<{ providerRef: string }>;
}
