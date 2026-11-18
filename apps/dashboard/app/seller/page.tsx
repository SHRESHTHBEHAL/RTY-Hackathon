import { PageHeader } from "@/components/PageHeader";
import { LoadError } from "@/components/seller/bits";
import { Overview } from "@/components/seller/Overview";
import { fetchChartDays, fetchOverview, loadData } from "@/components/seller/server";

export const metadata = { title: "Overview" };

export default async function SellerOverview() {
  const asOf = Date.now();
  const r = await loadData(async (gw) => {
    const [overview, chart] = await Promise.all([fetchOverview(gw), fetchChartDays(gw, asOf)]);
    return { overview, chart };
  });
  if (!r.ok) {
    return (
      <>
        <PageHeader eyebrow="Seller" title="Overview" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  return <Overview initial={r.data.overview} chart={r.data.chart} asOf={asOf} />;
}
