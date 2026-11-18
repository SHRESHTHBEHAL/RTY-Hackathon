import { ArrowRight, Bot, Building2, Store } from "lucide-react";
import Link from "next/link";
import { TicketCard } from "@/components/TicketCard";
import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";

const ROLES = [
  {
    icon: Building2,
    who: "Business",
    title: "Funds the agents",
    body: "Creates agents, each with its own wallet and API key. Tops up, then moves money into each wallet.",
    does: ["Creates agents", "Tops up and allocates", "Sets spending rules", "Watches every payment"],
    cta: { href: "/signup?as=business", label: "Sign up as a business" },
    tone: "card" as const,
  },
  {
    icon: Bot,
    who: "Agent",
    title: "Pays on its own",
    body: "Software holding an API key for one wallet. Picks Gaitway at the seller, pays from its wallet, and gets the service.",
    does: ["Spends up to its balance", "Opens a hold per seller", "Pays per request", "Gives back what it did not use"],
    cta: { href: "/docs#agent-quickstart", label: "Read the agent quickstart" },
    tone: "pass" as const,
  },
  {
    icon: Store,
    who: "Seller",
    title: "Integrates once",
    body: "Adds Gaitway the way it would add Stripe or Razorpay. Charges first, delivers on confirmation, and is paid out in batches.",
    does: ["Verifies credentials locally", "Charges, then delivers", "Lists services in the directory", "Receives payouts"],
    cta: { href: "/signup?as=seller", label: "Sign up as a seller" },
    tone: "card" as const,
  },
];

export function Roles() {
  return (
    <section aria-labelledby="roles-title" className="paper-grain border-b border-line">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Three parties, one gate</p>
          <h2 id="roles-title" className="font-display mt-3 text-[40px] text-ink sm:text-[56px]">
            Who holds which ticket
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            A business gives its agents money. Agents spend it at sellers who accept Gaitway. Gaitway stands between them and checks every payment.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
          {ROLES.map((r, i) => {
            const pass = r.tone === "pass";
            return (
              <Reveal as="li" key={r.who} delay={i * 0.06}>
                <TicketCard
                  tone={r.tone}
                  guilloche={pass}
                  className={cn("h-full", pass && "md:-translate-y-4")}
                  bodyClassName="p-6 pb-5"
                  stub={
                    <Link
                      href={r.cta.href}
                      className={cn(
                        "group -mx-1 inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-[8px] px-1 font-semibold",
                        pass ? "text-white" : "text-pass",
                      )}
                    >
                      {r.cta.label}
                      <ArrowRight size={18} strokeWidth={1.75} aria-hidden className="transition-transform duration-200 group-hover-fine:translate-x-0.5" />
                    </Link>
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-[10px] border",
                        pass ? "border-white/30 bg-white/10 text-white" : "border-line bg-paper text-ink",
                      )}
                    >
                      <r.icon size={20} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className={cn("eyebrow", pass && "text-white/80!")}>{r.who}</span>
                  </div>
                  <h3 className={cn("font-display mt-5 text-[32px]", pass ? "text-white" : "text-ink")}>{r.title}</h3>
                  <p className={cn("mt-3 text-[15px] leading-relaxed", pass ? "text-white/85" : "text-ink-soft")}>{r.body}</p>
                  <ul className={cn("mt-5 space-y-2 border-t pt-4 text-[15px]", pass ? "border-white/25 text-white" : "border-line text-ink")}>
                    {r.does.map((d) => (
                      <li key={d} className="flex items-center gap-2.5">
                        <span aria-hidden className={cn("size-2.5 rounded-full border", pass ? "border-white bg-white" : "border-ink bg-ink")} />
                        {d}
                      </li>
                    ))}
                  </ul>
                </TicketCard>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
