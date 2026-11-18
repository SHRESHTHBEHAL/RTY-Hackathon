import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";

export const metadata = { title: "Overview" };

/** Placeholder. The seller overview screen replaces this (Task 7). */
export default function SellerOverview() {
  return (
    <>
      <PageHeader eyebrow="Seller" title="Overview" description="What you are owed, what has been paid out, and recent charges will appear here." />
      <Card>
        <p className="text-ink-soft">This screen is being built.</p>
      </Card>
    </>
  );
}
