import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { agentNames } from "@/components/business/describe";
import { LoadError } from "@/components/business/LoadError";
import { Poller } from "@/components/business/Poller";
import { TxTable } from "@/components/business/TxTable";
import { cn } from "@/lib/cn";
import { load } from "../data";

export const metadata = { title: "Activity" };

const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ agent?: string; cursor?: string }> }) {
  const sp = await searchParams;
  const res = await load(async (gw) => {
    const agents = (await gw.listAgents({ limit: 200 })).data;
    const agent = sp.agent ? agents.find((a) => a.id === sp.agent) : undefined;
    const tx = await gw.listTransactions({ walletId: agent?.walletId, limit: PAGE, cursor: sp.cursor });
    return { agents: [...agents].reverse(), agent, tx };
  });
  const header = <PageHeader eyebrow="Business" title="Activity" description="Every movement of money across your business and its agents, newest first." />;
  if (!res.ok) {
    return (
      <>
        {header}
        <LoadError title="Activity did not load" message={res.message} />
      </>
    );
  }
  const { agents, agent, tx } = res.data;
  const href = (agentId?: string, cursor?: string | null) => {
    const q = new URLSearchParams();
    if (agentId) q.set("agent", agentId);
    if (cursor) q.set("cursor", cursor);
    const s = q.toString();
    return `/business/activity${s ? `?${s}` : ""}`;
  };
  const chips = [{ id: undefined as string | undefined, name: "All agents" }, ...agents.map((a) => ({ id: a.id as string | undefined, name: a.name }))];

  return (
    <>
      {sp.cursor ? null : <Poller />}
      {header}
      <SectionReveal className="flex flex-col gap-6">
        <nav aria-label="Filter by agent" className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = (agent?.id ?? undefined) === c.id;
            return (
              <Link
                key={c.id ?? "all"}
                href={href(c.id)}
                aria-current={on ? "page" : undefined}
                scroll={false}
                className={cn(
                  "pressable inline-flex h-11 items-center rounded-full border px-4 text-[15px] font-semibold",
                  on ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-card text-ink hover-fine:border-ink",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
        <TxTable
          key={agent?.id ?? "all"}
          rows={tx.data}
          names={agentNames(agents)}
          showAgent={!agent}
          label={agent ? `${agent.name}'s transactions` : "All transactions"}
          empty={
            <EmptyState
              icon={Activity}
              title={agent ? `${agent.name} has no activity yet` : "No activity yet"}
              body={agent ? "Add money to its pass and its payments will show here." : "Top up with test money to get started."}
              action={
                <ButtonLink href={agent ? `/business/agents/${agent.id}` : "/business/funds"} variant="secondary">
                  {agent ? `Open ${agent.name}` : "Top up"}
                </ButtonLink>
              }
            />
          }
        />
        {tx.nextCursor || sp.cursor ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sp.cursor ? (
              <Link href={href(agent?.id)} className="inline-flex h-11 items-center rounded-[8px] font-semibold text-pass">
                Back to newest
              </Link>
            ) : (
              <span />
            )}
            {tx.nextCursor ? (
              <ButtonLink href={href(agent?.id, tx.nextCursor)} variant="secondary" iconAfter={<ArrowRight size={18} strokeWidth={1.75} aria-hidden />}>
                Older
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </SectionReveal>
    </>
  );
}
