import { PageHeader } from "@/components/PageHeader";
import { LoadError } from "@/components/seller/bits";
import { loadData } from "@/components/seller/server";
import { Subscribers, type Subscriber } from "@/components/seller/Subscribers";

export const metadata = { title: "Subscriptions" };

/**
 * The contract has no seller route that lists mandates (GET /v1/mandates is
 * business-only), so subscribers are derived from the seller's own charges
 * that carry a mandateId. Nothing is invented: every row is real charge data.
 */
export default async function SubscriptionsPage() {
  const r = await loadData(async (gw) => {
    const found = new Map<string, Subscriber>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await gw.listCharges({ limit: 200, cursor });
      for (const c of res.data) {
        if (!c.mandateId) continue;
        const net = BigInt(c.amountMicros);
        const cur = found.get(c.mandateId);
        if (cur) {
          cur.charges += 1;
          cur.totalMicros = (BigInt(cur.totalMicros) + net).toString();
          if (c.createdAt > cur.lastAt) cur.lastAt = c.createdAt;
        } else {
          found.set(c.mandateId, { mandateId: c.mandateId, agentId: c.agentId, charges: 1, totalMicros: net.toString(), lastAt: c.createdAt });
        }
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return [...found.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  });
  if (!r.ok) {
    return (
      <>
        <PageHeader eyebrow="Seller" title="Subscriptions" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  return <Subscribers subscribers={r.data} />;
}
