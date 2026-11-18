import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BackLink, LoadError } from "@/components/seller/bits";
import { ChargeDetail } from "@/components/seller/ChargeDetail";
import { findCharge, loadData } from "@/components/seller/server";

export const metadata = { title: "Charge" };

export default async function ChargePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadData((gw) => findCharge(gw, id));
  if (!r.ok) {
    return (
      <>
        <BackLink href="/seller/charges">Charges</BackLink>
        <PageHeader eyebrow="Seller" title="Charge" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  if (!r.data) notFound();
  return <ChargeDetail charge={r.data} />;
}
