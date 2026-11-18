import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { LoadError } from "@/components/business/LoadError";
import { MandatesView, type MandateRow } from "@/components/business/MandatesView";
import { load } from "../data";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const res = await load(async (gw) => {
    const [mandates, agents, sellers] = await Promise.all([
      gw.listMandates({ limit: 200 }),
      gw.listAgents({ limit: 200 }),
      gw.listSellers({ limit: 200 }).catch(() => ({ data: [], nextCursor: null })),
    ]);
    return { mandates: mandates.data, agents: agents.data, sellers: sellers.data };
  });
  const header = (
    <PageHeader
      eyebrow="Business"
      title="Subscriptions"
      description="Sellers your agents allow to charge them on a schedule, up to a limit each period. Revoke one and the seller cannot charge again."
    />
  );
  if (!res.ok) {
    return (
      <>
        {header}
        <LoadError title="Subscriptions did not load" message={res.message} />
      </>
    );
  }
  const { mandates, agents, sellers } = res.data;
  const rows: MandateRow[] = mandates.map((m) => ({
    ...m,
    agentName: agents.find((a) => a.id === m.agentId)?.name ?? "Unknown agent",
    sellerName: sellers.find((s) => s.id === m.sellerId)?.name ?? m.sellerId,
  }));
  // Active first, then newest.
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
  return (
    <>
      {header}
      <SectionReveal>
        <MandatesView rows={rows} />
      </SectionReveal>
    </>
  );
}
