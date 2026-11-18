/** Slot for a signed business identity-check provider (context.md section 15). */
export interface IdentityProvider {
  verify(businessId: string): Promise<{ verified: boolean; verifier: string; verificationId: string }>;
}
