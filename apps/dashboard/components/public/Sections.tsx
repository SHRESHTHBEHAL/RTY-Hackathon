import { ArrowRight, Check, Clock3, Wrench } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { Guilloche } from "@/components/Guilloche";
import { TicketCard } from "@/components/TicketCard";
import { CodeBlock } from "./CodeBlock";
import { Reveal } from "./Reveal";
import { MCP_SNIPPET, MCP_TOOLS } from "./snippets";

/** packages/mcp/README.md, for people. */
export function McpSection() {
  return (
    <section aria-labelledby="mcp-title" className="paper-grain border-b border-line">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal>
          <p className="eyebrow">MCP server</p>
          <h2 id="mcp-title" className="font-display mt-3 text-[40px] text-ink sm:text-[56px]">
            Give your agent a wallet
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            Add Gaitway to Claude Code, Claude Desktop or any MCP client. The agent can check its balance, find sellers, call paid APIs, and pay a seller
            directly. It sees amounts in dollars, and never sees its key.
          </p>
          <ul className="mt-6 space-y-3 text-[16px] text-ink">
            <li className="flex gap-3">
              <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-go" aria-hidden />
              An HTTP 402 from a Gaitway seller is paid automatically, then retried once.
            </li>
            <li className="flex gap-3">
              <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-go" aria-hidden />
              Amounts above the server&apos;s limit are refused before any money moves. The default limit is $5.
            </li>
            <li className="flex gap-3">
              <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-go" aria-hidden />
              Refusals come back as plain words, with an approval link when a person can approve.
            </li>
          </ul>
          <Link href="/docs#mcp" className="group mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-pass">
            Set up the MCP server
            <ArrowRight size={18} strokeWidth={1.75} aria-hidden className="transition-transform duration-200 group-hover-fine:translate-x-0.5" />
          </Link>
        </Reveal>

        <Reveal delay={0.06} className="min-w-0 space-y-5">
          <CodeBlock code={MCP_SNIPPET} lang="sh" title="Claude Code" copyLabel="Copy the MCP command" />
          <TicketCard
            tone="card"
            stub={
              <span className="flex items-center gap-2">
                <Wrench size={16} strokeWidth={1.75} aria-hidden />
                Five tools. Amounts are dollar strings such as &quot;0.25&quot;.
              </span>
            }
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-line">
              {MCP_TOOLS.map((t) => (
                <li key={t.name} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-4">
                  <code className="font-mono text-[13px] font-medium text-ink">{t.name}</code>
                  <span className="text-[15px] text-ink-soft">{t.does}</span>
                </li>
              ))}
            </ul>
          </TicketCard>
        </Reveal>
      </div>
    </section>
  );
}

const BUILT = [
  "Businesses create agents, each with its own wallet and API key.",
  "Top up with test money and move it into agent wallets.",
  "Agents pay sellers through the SDK or the MCP server.",
  "Sellers verify the credential on their own server, charge, then deliver.",
  "Spending rules: a per-payment limit, a daily limit, and allowed sellers.",
  "Sellers are paid out in batches by a scheduled settlement.",
];

const NOT_YET = [
  "Real money. Everything runs on test money; no real money moves.",
  "Topping up by card or UPI, or paying out to a bank. The slot exists; the partner does not.",
  "Identity checks of businesses. The credential marks a business as unverified.",
  "Paying at online shops that have not integrated Gaitway.",
];

export function StatusSection() {
  return (
    <section aria-labelledby="status-title" className="border-b border-line bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Where it stands</p>
          <h2 id="status-title" className="font-display mt-3 text-[40px] text-ink sm:text-[56px]">
            What works, and what does not yet
          </h2>
          <p className="mt-4 text-lg text-ink-soft">This is version one. It runs end to end, in test mode, with test money.</p>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Reveal>
            <TicketCard
              tone="card"
              className="h-full [&>.ticket-head]:flex-1"
              bodyClassName="p-6"
              stub={<span className="font-semibold text-go-text">Test mode, end to end</span>}
            >
              <h3 className="font-display text-[28px] text-ink">Works today</h3>
              <ul className="mt-5 space-y-3.5">
                {BUILT.map((b) => (
                  <li key={b} className="flex gap-3 text-[16px] leading-relaxed text-ink">
                    <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-go" aria-hidden />
                    <span>
                      <span className="sr-only">Works: </span>
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            </TicketCard>
          </Reveal>
          <Reveal delay={0.06}>
            <TicketCard
              tone="card"
              className="h-full [&>.ticket-head]:flex-1"
              bodyClassName="p-6"
              stub={<span className="font-semibold text-hold-text">Not in version one</span>}
            >
              <h3 className="font-display text-[28px] text-ink">Not yet</h3>
              <ul className="mt-5 space-y-3.5">
                {NOT_YET.map((b) => (
                  <li key={b} className="flex gap-3 text-[16px] leading-relaxed text-ink">
                    <Clock3 size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-hold" aria-hidden />
                    <span>
                      <span className="sr-only">Not yet: </span>
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            </TicketCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function StartSection() {
  return (
    <section aria-labelledby="start-title" className="relative overflow-hidden bg-pass text-white">
      <Guilloche size={760} opacity={0.12} className="absolute -right-48 -top-64 text-white" />
      <div className="relative mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="start-title" className="font-display text-[40px] sm:text-[56px]">
            Start in test mode
          </h2>
          <p className="mt-3 max-w-lg text-lg text-white/85">Sign up, get an API key, and send your first payment with test money.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/signup?as=business" size="lg" variant="secondary" className="border-white bg-white text-ink hover-fine:border-white">
            Sign up as a business
          </ButtonLink>
          <ButtonLink href="/signup?as=seller" size="lg" variant="ghost" onInk className="border border-white/50 text-white hover-fine:bg-white/10">
            Sign up as a seller
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
