import { PageHeader } from "@/components/PageHeader";
import { LoadError } from "@/components/seller/bits";
import { PayoutsView } from "@/components/seller/PayoutsView";
import { loadData } from "@/components/seller/server";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const r = await loadData((gw) => gw.listPayouts({ limit: 200 }));
  if (!r.ok) {
    return (
      <>
        <PageHeader eyebrow="Seller" title="Payouts" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  return <PayoutsView payouts={r.data.data} />;
}
