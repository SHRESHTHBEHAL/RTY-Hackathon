import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { deriveTestAddress, derivationIndex, toChainKey } from "../src/index.js";
import { ANVIL_MNEMONIC } from "./anvil.js";

describe("keys", () => {
  it("toChainKey is keccak256 of the UTF-8 bytes", () => {
    expect(toChainKey("biz_abc")).toBe(keccak256(toBytes("biz_abc")));
  });

  it("derivationIndex is the first 4 bytes mod 2^31", () => {
    expect(derivationIndex("0xffffffff00000000000000000000000000000000000000000000000000000000")).toBe(2 ** 31 - 1);
    expect(derivationIndex("0x0000000a00000000000000000000000000000000000000000000000000000000")).toBe(10);
  });

  it("deriveTestAddress is deterministic and differs per key", () => {
    const a1 = deriveTestAddress(ANVIL_MNEMONIC, toChainKey("biz_a"));
    const a2 = deriveTestAddress(ANVIL_MNEMONIC, toChainKey("biz_a"));
    const b = deriveTestAddress(ANVIL_MNEMONIC, toChainKey("biz_b"));
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
