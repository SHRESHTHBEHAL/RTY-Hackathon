import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";

export const metadata = { title: "Overview" };

/** Placeholder. The business overview screen replaces this (Task 6). */
export default function BusinessOverview() {
  return (
    <>
      <PageHeader eyebrow="Business" title="Overview" description="Balances, agents and recent activity will appear here." />
      <Card>
        <p className="text-ink-soft">This screen is being built.</p>
      </Card>
    </>
  );
}
