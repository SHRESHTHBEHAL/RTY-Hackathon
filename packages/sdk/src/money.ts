// Money is always bigint (or a digits-only string on the wire). Never floating point.

const DIGITS = /^\d+$/;
const DOLLARS = /^\d+(\.\d{1,6})?$/;

/** Parse a micros string (digits only) to bigint. Throws on anything else. */
export function parseMicros(s: string): bigint {
  if (typeof s !== "string" || !DIGITS.test(s)) {
    throw new TypeError(`Invalid micros amount: ${JSON.stringify(s)}`);
  }
  return BigInt(s);
}

/** Convert a decimal dollar string ("0.01") to a micros string ("10000"). At most 6 decimals. */
export function usd(dollars: string): string {
  if (typeof dollars !== "string" || !DOLLARS.test(dollars)) {
    throw new TypeError(`Invalid dollar amount: ${JSON.stringify(dollars)} (use up to 6 decimals)`);
  }
  const [whole, frac = ""] = dollars.split(".");
  return (BigInt(whole!) * 1_000_000n + BigInt(frac.padEnd(6, "0"))).toString();
}

function group(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Display micros as dollars: two decimals normally, up to six (trailing zeros trimmed)
 * when the value is under one cent. Truncates, never rounds up.
 */
export function formatUsd(micros: bigint | string): string {
  if (typeof micros === "string" && !/^-?\d+$/.test(micros)) {
    throw new TypeError(`Invalid micros amount: ${JSON.stringify(micros)}`);
  }
  let v = BigInt(micros);
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0");
  let decimals: string;
  if (v > 0n && v < 10_000n) {
    decimals = frac.replace(/0+$/, "");
  } else {
    decimals = frac.slice(0, 2);
  }
  return `${neg ? "-" : ""}$${group(whole.toString())}.${decimals}`;
}
