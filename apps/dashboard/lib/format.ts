/**
 * Money formatting. Amounts are micros (millionths of a US dollar) as
 * digit strings on the wire and `bigint` in code. No floating point anywhere.
 *
 * Display rule: two decimals; up to six when the absolute value is under one
 * cent (trailing zeros trimmed, at least two decimals kept). Values are
 * truncated toward zero, never rounded up, so a balance is never shown as
 * more than it is.
 */

const MICROS_PER_DOLLAR = 1_000_000n;
const MICROS_PER_CENT = 10_000n;
const MICROS_RE = /^-?\d+$/;

export function parseMicros(value: string | bigint): bigint {
  if (typeof value === "bigint") return value;
  const s = value.trim();
  if (!MICROS_RE.test(s)) throw new TypeError(`Not a micros amount: "${value}"`);
  return BigInt(s);
}

export type MoneyParts = {
  /** "-" or "" */
  sign: "-" | "";
  /** "$1,234" */
  dollars: string;
  /** ".56" or ".0005" */
  fraction: string;
  /** the full string, "-$1,234.56" */
  text: string;
};

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function moneyParts(value: string | bigint): MoneyParts {
  const micros = parseMicros(value);
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / MICROS_PER_DOLLAR;
  const rem = abs % MICROS_PER_DOLLAR; // 0..999999
  let fractionDigits = rem.toString().padStart(6, "0");
  if (abs !== 0n && abs < MICROS_PER_CENT) {
    fractionDigits = fractionDigits.replace(/0+$/, "");
    if (fractionDigits.length < 2) fractionDigits = fractionDigits.padEnd(2, "0");
  } else {
    fractionDigits = fractionDigits.slice(0, 2);
  }
  const sign = negative && abs !== 0n ? "-" : "";
  const dollars = `$${groupThousands(whole.toString())}`;
  const fraction = `.${fractionDigits}`;
  return { sign, dollars, fraction, text: `${sign}${dollars}${fraction}` };
}

/** "10000" -> "$0.01", "1234560000" -> "$1,234.56", "500" -> "$0.0005" */
export function formatUsd(value: string | bigint, opts: { signed?: boolean } = {}): string {
  const parts = moneyParts(value);
  if (opts.signed && parts.sign === "" && parseMicros(value) !== 0n) return `+${parts.text}`;
  return parts.text;
}

/**
 * Parse what a person typed as dollars into micros. Accepts "12", "12.5",
 * "$1,234.56", "0.0005". Rejects more than six decimals, negatives and junk.
 * Returns null when the input is not a valid amount.
 */
export function dollarsToMicros(input: string): string | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{0,6}))?$/.exec(s);
  if (!m || (m[1] === undefined)) return null;
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? "").padEnd(6, "0") || "0");
  return (whole * MICROS_PER_DOLLAR + frac).toString();
}

/** Strict variant used by code: "0.01" -> "10000"; throws on bad input. */
export function usd(dollars: string): string {
  const micros = dollarsToMicros(dollars);
  if (micros === null) throw new TypeError(`Not a dollar amount: "${dollars}"`);
  return micros;
}

/** Short absolute date-time in UTC-agnostic local form: "18 Nov, 14:05". */
export function formatDateTime(iso: string, locale = "en-GB"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/** "agt_k2j…9x1a" for long IDs in tight spaces. Full ID stays in title/copy. */
export function shortId(id: string, keep = 4): string {
  const i = id.indexOf("_");
  if (i < 0 || id.length <= i + 1 + keep * 2 + 1) return id;
  return `${id.slice(0, i + 1 + keep)}…${id.slice(-keep)}`;
}
