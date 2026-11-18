import { describe, expect, it } from "vitest";
import { dollarsToMicros, formatUsd, moneyParts, parseMicros, usd } from "./format";

describe("formatUsd", () => {
  it("formats the contract examples", () => {
    expect(formatUsd("10000")).toBe("$0.01");
    expect(formatUsd("1234560000")).toBe("$1,234.56");
    expect(formatUsd("500")).toBe("$0.0005");
  });

  it("handles zero, whole dollars and negatives", () => {
    expect(formatUsd("0")).toBe("$0.00");
    expect(formatUsd("1000000")).toBe("$1.00");
    expect(formatUsd("-10000")).toBe("-$0.01");
    expect(formatUsd("-500")).toBe("-$0.0005");
    expect(formatUsd(10000n, { signed: true })).toBe("+$0.01");
  });

  it("shows up to six decimals only under one cent", () => {
    expect(formatUsd("1")).toBe("$0.000001");
    expect(formatUsd("9999")).toBe("$0.009999");
    expect(formatUsd("1000")).toBe("$0.001");
    expect(formatUsd("100000")).toBe("$0.10");
  });

  it("truncates instead of rounding up", () => {
    expect(formatUsd("19999")).toBe("$0.01");
    expect(formatUsd("1234565000")).toBe("$1,234.56");
  });

  it("is exact for very large balances", () => {
    // 90 quadrillion dollars and one micro: far beyond Number precision
    expect(formatUsd("90000000000000000000001")).toBe("$90,000,000,000,000,000.00");
    expect(moneyParts("123456789012345678").dollars).toBe("$123,456,789,012");
  });

  it("rejects things that are not micros", () => {
    expect(() => formatUsd("1.5")).toThrow();
    expect(() => formatUsd("abc")).toThrow();
    expect(() => parseMicros("")).toThrow();
  });
});

describe("dollar input", () => {
  it("parses dollars to micros", () => {
    expect(usd("0.01")).toBe("10000");
    expect(usd("1")).toBe("1000000");
    expect(dollarsToMicros("$1,234.56")).toBe("1234560000");
    expect(dollarsToMicros("0.0005")).toBe("500");
  });
  it("rejects too many decimals and junk", () => {
    expect(() => usd("1.2345678")).toThrow();
    expect(dollarsToMicros("-1")).toBeNull();
    expect(dollarsToMicros("ten")).toBeNull();
    expect(dollarsToMicros("")).toBeNull();
  });
});
