import type { ReactNode } from "react";
import { TicketCard } from "@/components/TicketCard";

/** The auth form, cut as a ticket: title and fields above, the way across below. */
export function AuthTicket({ eyebrow, title, children, stub }: { eyebrow: string; title: ReactNode; children: ReactNode; stub: ReactNode }) {
  return (
    <TicketCard as="section" bodyClassName="p-6 pb-7 sm:p-8 sm:pb-8" stubClassName="justify-center px-6 py-4 text-[15px] sm:px-8" stub={stub}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="font-display mt-3 text-[40px] text-ink sm:text-[48px]">{title}</h1>
      <div className="mt-7">{children}</div>
    </TicketCard>
  );
}

export function FormBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-[10px] border border-stop/30 bg-stop/8 px-3.5 py-3 text-sm font-medium text-stop-text">
      {message}
    </p>
  );
}
