import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Lock, LockOpen, Receipt, Undo2, type LucideIcon } from "lucide-react";
import type { Agent, Rules, Transaction } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";

/** walletId -> agent name, for wording activity. */
export function agentNames(agents: Agent[]): Record<string, string> {
  return Object.fromEntries(agents.map((a) => [a.walletId, a.name]));
}

export type TxWords = { title: string; icon: LucideIcon; tone: "in" | "out" | "move" | "hold" };

/** One plain sentence for a ledger entry, from the business's point of view. */
export function describeTx(tx: Transaction, names: Record<string, string>): TxWords {
  const agent = (tx.walletId && names[tx.walletId]) || "An agent";
  const other = tx.counterparty ?? "a seller";
  const positive = !tx.amountMicros.startsWith("-");
  switch (tx.type) {
    case "topup":
      return { title: "Top-up arrived", icon: ArrowDownToLine, tone: "in" };
    case "withdrawal":
      return { title: "Withdrawal sent", icon: ArrowUpFromLine, tone: "out" };
    case "allocation":
      return positive
        ? { title: `Added money to ${agent}`, icon: ArrowRightLeft, tone: "move" }
        : { title: `Took money back from ${agent}`, icon: ArrowRightLeft, tone: "move" };
    case "hold":
      return { title: `${agent} put money on hold for ${other}`, icon: Lock, tone: "hold" };
    case "release":
      return { title: `${agent}'s unused hold for ${other} came back`, icon: LockOpen, tone: "hold" };
    case "charge":
      return { title: `${agent} paid ${other}`, icon: Receipt, tone: "out" };
    case "refund":
      return { title: `${other} refunded ${agent}`, icon: Undo2, tone: "in" };
  }
}

export const TX_TYPE_LABEL: Record<Transaction["type"], string> = {
  topup: "Top-up",
  withdrawal: "Withdrawal",
  allocation: "Allocation",
  hold: "Hold",
  release: "Release",
  charge: "Payment",
  refund: "Refund",
};

/** Spending rules as one or two plain sentences. */
export function describeRules(rules: Rules, sellerName: (id: string) => string): string[] {
  const out: string[] = [];
  const caps: string[] = [];
  if (rules.perPaymentMaxMicros) caps.push(`up to ${formatUsd(rules.perPaymentMaxMicros)} per payment`);
  if (rules.dailyMaxMicros) caps.push(`up to ${formatUsd(rules.dailyMaxMicros)} a day`);
  const who =
    rules.allowedSellerIds === null
      ? "any seller"
      : rules.allowedSellerIds.length === 1
        ? sellerName(rules.allowedSellerIds[0]!)
        : `only ${listWords(rules.allowedSellerIds.map(sellerName))}`;
  out.push(`Can pay ${who}${caps.length ? `, ${caps.join(" and ")}` : " with no limit beyond its balance"}.`);
  if (rules.dailyMaxMicros) out.push("The daily limit resets at midnight UTC.");
  return out;
}

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export const PERIOD_WORD = { day: "a day", week: "a week", month: "a month" } as const;
