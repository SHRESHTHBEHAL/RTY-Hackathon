import { PageHeader } from "@/components/PageHeader";
import { LoadError } from "@/components/seller/bits";
import { ChargesView } from "@/components/seller/ChargesView";
import { loadData } from "@/components/seller/server";

export const metadata = { title: "Charges" };

export default async function ChargesPage() {
  const r = await loadData((gw) => gw.listCharges({ limit: 50 }));
  if (!r.ok) {
    return (
      <>
        <PageHeader eyebrow="Seller" title="Charges" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  return <ChargesView initial={r.data.data} nextCursor={r.data.nextCursor} />;
}
