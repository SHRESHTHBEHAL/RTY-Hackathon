import { PageHeader } from "@/components/PageHeader";
import { requireAccount } from "@/lib/session";
import { LoadError } from "@/components/seller/bits";
import { DevelopersView } from "@/components/seller/DevelopersView";
import { loadData } from "@/components/seller/server";

export const metadata = { title: "Developers" };

/** The seller quickstart from packages/sdk/README.md, with this seller's ID filled in. */
function snippetFor(sellerId: string, baseUrl: string) {
  return `import express from "express";
import { GaitwaySeller, usd } from "@gaitway/sdk";
import { gaitwayExpress } from "@gaitway/sdk/express";

const seller = new GaitwaySeller({
  apiKey: process.env.GAITWAY_SELLER_KEY!, // gw_test_sel_...
  sellerId: "${sellerId}",
  baseUrl: "${baseUrl}",
});

const app = express();
app.post(
  "/relay",
  gaitwayExpress(seller, { priceMicros: usd("0.01"), priceNote: "per message" }),
  (req, res) => res.json({ ok: true, paidBy: req.gaitway!.claims.business.name }),
);
app.listen(3000);
`;
}

export default async function DevelopersPage() {
  const { account } = await requireAccount("seller");
  const sellerId = account.sellerId ?? "";
  const r = await loadData((gw) => gw.listKeys({ limit: 200 }));
  if (!r.ok) {
    return (
      <>
        <PageHeader eyebrow="Seller" title="Developers" />
        <LoadError message={r.message} code={r.code} />
      </>
    );
  }
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787").replace(/\/+$/, "");
  return <DevelopersView sellerId={sellerId} keys={r.data.data} snippet={snippetFor(sellerId, baseUrl)} />;
}
