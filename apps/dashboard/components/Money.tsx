import { cn } from "@/lib/cn";
import { formatUsd, moneyParts } from "@/lib/format";
import { RollingNumber } from "./RollingNumber";

export type MoneySize = "sm" | "md" | "lg" | "xl" | "2xl";

export type MoneyProps = {
  /** Micros string or bigint, e.g. "10000" for one cent. */
  micros: string | bigint;
  /**
   * display: Big Shoulders, dollars large and cents smaller and raised (balances).
   * mono:    JetBrains Mono, tabular (tables, IDs, amounts in lists).
   * text:    Onest with tabular figures, for amounts inside sentences.
   */
  variant?: "display" | "mono" | "text";
  /** Display sizes: sm 24, md 32, lg 48, xl 72, 2xl 112 (px). Ignored for mono/text. */
  size?: MoneySize;
  /** Departure-board rolling digits when the value changes. */
  rolling?: boolean;
  /** Prefix positive values with "+". */
  signed?: boolean;
  className?: string;
};

const displaySize: Record<MoneySize, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-[32px] sm:text-3xl",
  xl: "text-3xl sm:text-4xl",
  "2xl": "text-4xl sm:text-5xl",
};

/**
 * Every amount on screen goes through Money. Formatting is bigint-exact
 * (lib/format.ts). The full amount is always present as plain text for
 * screen readers and tests; the styled parts are aria-hidden.
 */
export function Money({ micros, variant = "display", size = "lg", rolling = false, signed = false, className }: MoneyProps) {
  const parts = moneyParts(micros);
  const text = formatUsd(micros, { signed });
  const sign = text.startsWith("+") ? "+" : parts.sign;

  if (variant !== "display") {
    const cls = cn(variant === "mono" ? "font-mono text-[0.9375em]" : "font-sans", "tabular whitespace-nowrap", className);
    return rolling ? <RollingNumber value={text} className={cls} /> : <span className={cls}>{text}</span>;
  }

  return (
    <span className={cn("font-display inline-flex items-start whitespace-nowrap leading-[0.95]", displaySize[size], className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex items-start">
        {rolling ? <RollingNumber value={`${sign}${parts.dollars}`} label="" /> : <span className="tabular">{`${sign}${parts.dollars}`}</span>}
        <span className="ml-[0.04em] mt-[0.07em] text-[0.5em] leading-none tracking-[0.01em]">
          {rolling ? <RollingNumber value={parts.fraction} label="" /> : <span className="tabular">{parts.fraction}</span>}
        </span>
      </span>
    </span>
  );
}
