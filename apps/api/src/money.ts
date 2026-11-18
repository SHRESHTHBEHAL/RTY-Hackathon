import { z } from "zod";
import { ApiError } from "./errors.js";

/** Largest amount accepted anywhere: 2^63 - 1 micros (fits Postgres bigint). */
export const MAX_MICROS = 9223372036854775807n;
const DIGITS = /^[1-9][0-9]{0,18}$/;

/** Strictly parses a positive whole number of micros given as a digit string. */
export function parseMicros(input: unknown, field = "amountMicros"): bigint {
  if (typeof input !== "string" || !DIGITS.test(input)) {
    throw new ApiError("validation_failed", `${field} must be a positive whole number of micros, as a string of digits`);
  }
  const v = BigInt(input);
  if (v > MAX_MICROS) throw new ApiError("validation_failed", `${field} is too large`);
  return v;
}

export function formatMicros(v: bigint): string {
  return v.toString();
}

/** zod schema for a micros field: digit string in, bigint out. */
export const zMicros = z.string().transform((s, ctx) => {
  try {
    return parseMicros(s);
  } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
    return z.NEVER;
  }
});
