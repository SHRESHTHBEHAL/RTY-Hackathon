import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { Hex } from "./types.js";

/** keccak256 of the identifier's UTF-8 bytes (context.md section 6). */
export function toChainKey(id: string): Hex {
  return `0x${bytesToHex(keccak_256(utf8ToBytes(id)))}`;
}
