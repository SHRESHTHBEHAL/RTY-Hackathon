import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { AgentsView } from "@/components/business/AgentsView";
import { LoadError } from "@/components/business/LoadError";
import { Poller } from "@/components/business/Poller";
import { load } from "../data";

export const metadata = { title: "Agents" };

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const res = await load(async (gw) => {
    const [agents, balance] = await Promise.all([gw.listAgents({ limit: 200 }), gw.getBalance()]);
    return { agents: agents.data, wallets: balance.wallets };
  });
  if (!res.ok) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Agents" />
        <LoadError title="Your agents did not load" message={res.message} />
      </>
    );
  }
  return (
    <>
      <Poller />
      <SectionReveal>
        <AgentsView agents={[...res.data.agents].reverse()} wallets={res.data.wallets} autoOpen={sp.new === "1"} />
      </SectionReveal>
    </>
  );
}
