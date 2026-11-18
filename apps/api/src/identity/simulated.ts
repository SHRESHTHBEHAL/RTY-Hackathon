import { randomBase36 } from "../ids.js";
import type { IdentityProvider } from "./types.js";

/** SIMULATION ONLY. Marks every business as verified without checking anything. */
export function createSimulatedIdentity(): IdentityProvider {
  return {
    async verify() {
      return { verified: true, verifier: "simulated", verificationId: `simid_${randomBase36(16)}` };
    },
  };
}
