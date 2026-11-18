import { Activity, ArrowRight, Bot, Plus } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { ActivityFeed } from "@/components/business/ActivityFeed";
import { agentNames } from "@/components/business/describe";
import { FareBox } from "@/components/business/FareBox";
import { LedgerProvider } from "@/components/business/ledger";
import { ledgerFrom } from "@/components/business/ledger-state";
import { LoadError } from "@/components/business/LoadError";
import { PassDeck } from "@/components/business/PassDeck";
import { Poller } from "@/components/business/Poller";
import { load } from "./data";

export const metadata = { title: "Overview" };

export default async function BusinessOverview() {
  const res = await load(async (gw) => {
    const [balance, agents, tx] = await Promise.all([gw.getBalance(), gw.listAgents({ limit: 200 }), gw.listTransactions({ limit: 8 })]);
    return { balance, agents: agents.data, tx: tx.data };
  });

  const header = (
    <PageHeader
      eyebrow="Business"
      title="Overview"
      action={
        <ButtonLink href="/business/agents?new=1" icon={<Plus size={18} strokeWidth={2} aria-hidden />}>
          New agent
        </ButtonLink>
      }
    />
  );

  if (!res.ok) {
    return (
      <>
        <Poller />
        {header}
        <LoadError title="Your balances did not load" message={res.message} />
      </>
    );
  }

  const { balance, tx } = res.data;
  const agents = [...res.data.agents].reverse(); // oldest first, the order they were made
  let total = BigInt(balance.unallocatedMicros);
  for (const w of balance.wallets) total += BigInt(w.availableMicros) + BigInt(w.heldMicros);
  const ledger = ledgerFrom(balance.unallocatedMicros, balance.wallets);

  return (
    <LedgerProvider server={ledger}>
      <Poller />
      {header}
      <SectionReveal className="flex flex-col gap-12">
        <FareBox totalMicros={total.toString()} />

        <section aria-labelledby="passes-title">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="passes-title" className="font-display text-2xl text-ink">
                Agent passes
              </h2>
              <p className="mt-1 text-[15px] text-ink-soft">
                {agents.length === 0 ? "Each agent gets its own pass with its own balance." : `${agents.length} ${agents.length === 1 ? "agent" : "agents"}. Each spends only what is on its pass.`}
              </p>
            </div>
            {agents.length > 0 ? <SeeAll href="/business/agents" label="Manage agents" /> : null}
          </div>
          {agents.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={Bot}
                title="No agents yet"
                body="Create an agent to give it a pass. Then add money to the pass and the agent can pay sellers on its own."
                action={
                  <ButtonLink href="/business/agents?new=1" icon={<Plus size={18} strokeWidth={2} aria-hidden />}>
                    Create agent
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <PassDeck agents={agents} balances={ledger.wallets} />
          )}
        </section>

        <section aria-labelledby="activity-title">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="activity-title" className="font-display text-2xl text-ink">
              Recent activity
            </h2>
            {tx.length > 0 ? <SeeAll href="/business/activity" label="All activity" /> : null}
          </div>
          <Card padding="none" className="px-4 sm:px-6">
            {tx.length === 0 ? (
              <EmptyState
                icon={Activity}
                size="compact"
                title="Nothing has happened yet"
                body="Top-ups, money you give to agents, and every payment they make will show here."
                action={
                  <ButtonLink href="/business/funds" variant="secondary">
                    Top up with test money
                  </ButtonLink>
                }
              />
            ) : (
              <ActivityFeed rows={tx} names={agentNames(res.data.agents)} />
            )}
          </Card>
        </section>
      </SectionReveal>
    </LedgerProvider>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-pass">
      {label}
      <ArrowRight size={16} strokeWidth={2} aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover-fine:translate-x-0.5" />
    </Link>
  );
}
