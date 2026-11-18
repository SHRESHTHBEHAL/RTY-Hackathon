import { PageHeader } from "@/components/PageHeader";
import { LoadError } from "@/components/seller/bits";
import { loadData } from "@/components/seller/server";
import { ServicesView } from "@/components/seller/ServicesView";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const r = await loadData((gw) => gw.listServices({ limit: 200 }));
  if (!r.ok) {
    return (
      <>
        <PageHeader eyebrow="Seller" title="Services" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  return <ServicesView initial={r.data.data} />;
}
