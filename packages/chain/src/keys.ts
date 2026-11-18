import { keccak256, toBytes } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import type { Hex } from "./types.js";

/** keccak256 of the identifier's UTF-8 bytes (context.md section 6). */
export function toChainKey(id: string): Hex {
  return keccak256(toBytes(id));
}

/** First 4 bytes of the chain key as an unsigned integer, modulo 2^31. */
export function derivationIndex(chainKey: Hex): number {
  return Number.parseInt(chainKey.slice(2, 10), 16) % 2 ** 31;
}

/** Address at m/44'/60'/0'/0/<index> of the mnemonic. Test environments only. */
export function deriveTestAddress(mnemonic: string, chainKey: Hex): Hex {
  return mnemonicToAccount(mnemonic, { addressIndex: derivationIndex(chainKey) }).address;
}
