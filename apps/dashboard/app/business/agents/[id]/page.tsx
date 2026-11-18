import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { AgentHeader, AgentMoney, RulesSummary } from "@/components/business/AgentDetail";
import { agentNames, describeRules } from "@/components/business/describe";
import { KeysPanel } from "@/components/business/KeysPanel";
import { LedgerProvider } from "@/components/business/ledger";
import { ledgerFrom } from "@/components/business/ledger-state";
import { LoadError } from "@/components/business/LoadError";
import { Poller } from "@/components/business/Poller";
import { TxTable } from "@/components/business/TxTable";
import { load } from "../../data";

export const metadata = { title: "Agent" };

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await load(async (gw) => {
    const { agent, wallet } = await gw.getAgent(id);
    const [balance, tx, keys, rules, sellers] = await Promise.all([
      gw.getBalance(),
      gw.listTransactions({ walletId: agent.walletId, limit: 11 }),
      gw.listAgentKeys(agent.id, { limit: 200 }),
      gw.getAgentRules(agent.id),
      gw.listSellers({ limit: 200 }).catch(() => ({ data: [], nextCursor: null })),
    ]);
    return { agent, wallet, balance, tx: tx.data, keys: keys.data, rules: rules.rules, sellers: sellers.data };
  });

  if (!res.ok) {
    if (res.code === "not_found") notFound();
    return (
      <>
        <PageHeader eyebrow="Agent" title="Agent" />
        <LoadError title="This agent did not load" message={res.message} />
      </>
    );
  }

  const { agent, wallet, balance, tx, keys, rules, sellers } = res.data;
  const sellerName = (sid: string) => sellers.find((s) => s.id === sid)?.name ?? sid;
  const hasRules = rules.perPaymentMaxMicros !== null || rules.dailyMaxMicros !== null || rules.allowedSellerIds !== null;
  // Keep this agent's wallet current even if the business-wide list lags.
  const wallets = [...balance.wallets.filter((w) => w.walletId !== wallet.walletId), wallet];

  return (
    <LedgerProvider server={ledgerFrom(balance.unallocatedMicros, wallets)}>
      <Poller />
      <AgentHeader agent={agent} />
      <SectionReveal className="flex flex-col gap-10">
        <AgentMoney agent={agent} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RulesSummary agentId={agent.id} hasRules={hasRules} lines={describeRules(rules, sellerName)} />
          <KeysPanel
            keys={keys}
            scope={{ type: "agent", agentId: agent.id, agentName: agent.name }}
            description="The agent signs its payments with one of these."
          />
        </div>
        <section aria-labelledby="tx-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-3">
            <h2 id="tx-title" className="font-display text-2xl text-ink">
              {agent.name}&apos;s transactions
            </h2>
            {tx.length > 10 ? (
              <Link href={`/business/activity?agent=${agent.id}`} className="group inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-pass">
                All of {agent.name}&apos;s activity
                <ArrowRight size={16} strokeWidth={2} aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover-fine:translate-x-0.5" />
              </Link>
            ) : null}
          </div>
          <TxTable rows={tx.slice(0, 10)} names={agentNames([agent])} label={`${agent.name}'s transactions`} />
        </section>
      </SectionReveal>
    </LedgerProvider>
  );
}
