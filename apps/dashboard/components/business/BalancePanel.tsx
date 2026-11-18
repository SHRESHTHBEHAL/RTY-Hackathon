import type { ReactNode } from "react";
import { Guilloche } from "@/components/Guilloche";
import { Money } from "@/components/Money";

/** Ink panel with one big rolling balance, for the funds screens. */
export function BalancePanel({ label, micros, note, children, testId }: { label: string; micros: string; note?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <section aria-label={label} className="surface-ink relative flex flex-col justify-between gap-8 overflow-hidden rounded-[18px] p-6 sm:p-8">
      <Guilloche size={460} opacity={0.08} className="absolute -right-36 -top-40 text-go-bright" />
      <div className="relative">
        <p className="eyebrow text-on-ink-soft!">{label}</p>
        <div className="mt-3" data-testid={testId}>
          <Money micros={micros} size="xl" rolling className="text-[56px]! sm:text-[72px]!" />
        </div>
        {note ? <p className="mt-3 max-w-sm text-[15px] text-on-ink-soft">{note}</p> : null}
      </div>
      {children ? <div className="relative">{children}</div> : null}
    </section>
  );
}
