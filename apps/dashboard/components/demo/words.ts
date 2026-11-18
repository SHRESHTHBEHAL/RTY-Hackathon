import { formatUsd } from "@/lib/format";
import type { Rules } from "@/lib/api/types";

const abs = (m: string) => (m.startsWith("-") ? m.slice(1) : m);

/** One feed sentence per ledger event, in the interface's words. */
export function sentence(
  kind: string,
  agent: string | null,
  amountMicros: string,
  counterparty: string | null,
  business: string,
): { text: string; tone: "go" | "hold" | "neutral" | "stop" } {
  const amt = formatUsd(abs(amountMicros));
  const who = agent ?? "An agent";
  const cp = counterparty ?? "a seller";
  switch (kind) {
    case "charge":
      return { text: `${who} paid ${cp} ${amt}`, tone: "go" };
    case "hold":
      return { text: `${who} put ${amt} on hold for ${cp}`, tone: "hold" };
    case "release":
      return { text: `${amt} unused hold went back to ${who}`, tone: "neutral" };
    case "allocation":
      return amountMicros.startsWith("-")
        ? { text: `${business} took ${amt} back from ${who}`, tone: "neutral" }
        : { text: `${business} added ${amt} to ${who}`, tone: "neutral" };
    case "topup":
      return { text: `${business} topped up ${amt} of test money`, tone: "neutral" };
    case "refund":
      return { text: `${cp} refunded ${amt} to ${who}`, tone: "neutral" };
    case "withdrawal":
      return { text: `${business} took out ${amt}`, tone: "neutral" };
    default:
      return { text: `${who}: ${kind} ${amt}`, tone: "neutral" };
  }
}

/** An agent's spending rules in plain words. */
export function rulesInWords(r: Rules | null, sellerName: string, sellerId: string): string[] {
  if (!r) return ["No rules beyond its balance"];
  const out: string[] = [];
  if (r.perPaymentMaxMicros) out.push(`Up to ${formatUsd(r.perPaymentMaxMicros)} a payment`);
  if (r.dailyMaxMicros) out.push(`${formatUsd(r.dailyMaxMicros)} a day`);
  if (r.allowedSellerIds) {
    out.push(r.allowedSellerIds.length === 1 && r.allowedSellerIds[0] === sellerId ? `Only ${sellerName}` : `${r.allowedSellerIds.length} sellers only`);
  }
  if (out.length === 0) out.push("No rules beyond its balance");
  return out;
}
