import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Guilloche } from "./Guilloche";

export type TicketTone = "card" | "ink" | "pass";

export type TicketCardProps = {
  /** The body of the ticket (above the perforation). */
  children: ReactNode;
  /** The stub (below the perforation). Usually the ID in mono, plus an action. */
  stub?: ReactNode;
  /** card on paper (default), ink on dark surfaces, pass for the one ticket that matters most. */
  tone?: TicketTone;
  /** An engraved rosette behind the body, as on wallet passes. */
  guilloche?: boolean;
  /** Darken the hairline on hover; use when the whole ticket is a link. */
  interactive?: boolean;
  as?: "div" | "article" | "li" | "section";
  className?: string;
  bodyClassName?: string;
  stubClassName?: string;
  "aria-label"?: string;
};

/**
 * Wallets and credentials are tickets: a card with semicircular notches cut
 * from the left and right edges, and a dashed perforation separating the
 * body from the stub. Shape is CSS mask only (see .ticket in globals.css),
 * so it server-renders exactly and scales with content.
 */
export function TicketCard({
  children,
  stub,
  tone = "card",
  guilloche = false,
  interactive = false,
  as: Tag = "div",
  className,
  bodyClassName,
  stubClassName,
  ...aria
}: TicketCardProps) {
  if (!stub) {
    // No stub: an ordinary card in ticket colours, so tickets and cards can sit in one grid.
    return (
      <Tag
        className={cn("ticket", className)}
        data-tone={tone}
        data-interactive={interactive || undefined}
        {...aria}
      >
        <div className="ticket-head rounded-b-[14px]! [mask:none]!" style={{ paddingBottom: 1 }}>
          <div className={cn("ticket-fill rounded-b-[13px]! [mask:none]! p-5", bodyClassName)}>{children}</div>
        </div>
      </Tag>
    );
  }
  return (
    <Tag className={cn("ticket", className)} data-tone={tone} data-interactive={interactive || undefined} {...aria}>
      <div className="ticket-head">
        <div className={cn("ticket-fill p-5 pb-4", bodyClassName)}>
          {guilloche ? (
            <Guilloche
              size={340}
              opacity={tone === "card" ? 0.09 : 0.12}
              className={cn(
                "absolute -right-24 -top-28",
                tone === "card" ? "text-pass" : tone === "ink" ? "text-go-bright" : "text-white",
              )}
            />
          ) : null}
          <div className="relative">{children}</div>
        </div>
      </div>
      <div className="ticket-stub">
        <div
          className={cn(
            "ticket-fill flex min-h-12 items-center gap-3 px-5 py-3 text-sm",
            tone === "card" ? "text-ink-soft" : tone === "ink" ? "text-on-ink-soft" : "text-white/80",
            stubClassName,
          )}
        >
          {stub}
        </div>
      </div>
    </Tag>
  );
}

export { Punches, type PunchesProps } from "./Punches";
