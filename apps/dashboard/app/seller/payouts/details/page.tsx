import { PageHeader } from "@/components/PageHeader";
import { BackLink, LoadError } from "@/components/seller/bits";
import { PayoutDetails } from "@/components/seller/PayoutDetails";
import { loadData } from "@/components/seller/server";

export const metadata = { title: "Payout details" };

export default async function PayoutDetailsPage() {
  const r = await loadData((gw) => gw.getPayoutAddress());
  if (!r.ok) {
    return (
      <>
        <BackLink href="/seller/payouts">Payouts</BackLink>
        <PageHeader eyebrow="Seller" title="Payout details" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  return <PayoutDetails address={r.data.address} />;
}
