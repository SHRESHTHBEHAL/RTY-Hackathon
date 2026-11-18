import { describe, expect, it } from "vitest";
import { formatMicros, parseMicros } from "../src/money.js";
import { newId } from "../src/ids.js";
import { ApiError } from "../src/errors.js";

describe("parseMicros", () => {
  it("parses digit strings", () => {
    expect(parseMicros("10000")).toBe(10000n);
    expect(parseMicros("9223372036854775807")).toBe(9223372036854775807n);
  });
  const bads: unknown[] = ["-1", "0", "1.5", "+5", "01", "", " 5", "1e6", 10000, null, undefined, "9223372036854775808", "99999999999999999999"];
  for (const bad of bads) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      let err: unknown;
      try {
        parseMicros(bad);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("validation_failed");
    });
  }
  it("formats", () => {
    expect(formatMicros(10000n)).toBe("10000");
    expect(formatMicros(-5n)).toBe("-5");
  });
});

describe("newId", () => {
  it("has prefix and 24 base-36 chars", () => {
    expect(newId("agt")).toMatch(/^agt_[0-9a-z]{24}$/);
    expect(newId("agt")).not.toBe(newId("agt"));
  });
});
