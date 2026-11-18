import { describe, expect, it } from "vitest";
import { formatUsd, parseMicros, usd } from "../src/money.js";

describe("usd", () => {
  it("converts dollars to micros strings", () => {
    expect(usd("0.01")).toBe("10000");
    expect(usd("1")).toBe("1000000");
    expect(usd("100.5")).toBe("100500000");
    expect(usd("0.000001")).toBe("1");
  });
  it("throws on more than six decimals or junk", () => {
    expect(() => usd("1.2345678")).toThrow();
    expect(() => usd("abc")).toThrow();
    expect(() => usd("-1")).toThrow();
    expect(() => usd("")).toThrow();
  });
});

describe("parseMicros", () => {
  it("parses digit strings to bigint", () => {
    expect(parseMicros("10000")).toBe(10000n);
    expect(parseMicros("0")).toBe(0n);
    expect(parseMicros("123456789012345678901234567890")).toBe(123456789012345678901234567890n);
  });
  it("rejects non-digit strings", () => {
    for (const bad of ["", "-1", "1.5", "1e3", " 1", "0x10", "abc"]) {
      expect(() => parseMicros(bad)).toThrow();
    }
  });
});

describe("formatUsd", () => {
  it("formats cents and dollars", () => {
    expect(formatUsd("10000")).toBe("$0.01");
    expect(formatUsd("1234560000")).toBe("$1,234.56");
    expect(formatUsd(1000000n)).toBe("$1.00");
    expect(formatUsd("0")).toBe("$0.00");
  });
  it("shows up to six decimals under one cent", () => {
    expect(formatUsd("500")).toBe("$0.0005");
    expect(formatUsd("1")).toBe("$0.000001");
    expect(formatUsd("5000")).toBe("$0.005");
  });
  it("handles very large and negative values exactly", () => {
    expect(formatUsd("123456789012345678000000")).toBe("$123,456,789,012,345,678.00");
    expect(formatUsd("-10000")).toBe("-$0.01");
  });
});
