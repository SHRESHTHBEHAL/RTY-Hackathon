import { ArrowUpFromLine } from "lucide-react";
import { TestModeBadge } from "@/components/Badge";
import { ButtonLink } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { BalancePanel } from "@/components/business/BalancePanel";
import { TopupForm, TopupsTable } from "@/components/business/Funds";
import { LoadError } from "@/components/business/LoadError";
import { Poller } from "@/components/business/Poller";
import { load } from "../data";

export const metadata = { title: "Funds" };

export default async function FundsPage() {
  const res = await load(async (gw) => {
    const [balance, topups] = await Promise.all([gw.getBalance(), gw.listTopups({ limit: 50 })]);
    return { balance, topups: topups.data };
  });
  const header = (
    <PageHeader
      eyebrow="Business"
      title="Funds"
      description="Top up to add money, then give it to agents. What you have not given out stays unallocated."
      meta={<TestModeBadge />}
      action={
        <ButtonLink href="/business/funds/withdraw" variant="secondary" icon={<ArrowUpFromLine size={18} strokeWidth={1.75} aria-hidden />}>
          Withdraw
        </ButtonLink>
      }
    />
  );
  if (!res.ok) {
    return (
      <>
        <Poller />
        {header}
        <LoadError title="Your funds did not load" message={res.message} />
      </>
    );
  }
  const { balance, topups } = res.data;
  const pending = topups.filter((t) => t.status === "pending").length;
  return (
    <>
      <Poller />
      {header}
      <SectionReveal className="flex flex-col gap-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BalancePanel
            label="Unallocated balance"
            micros={balance.unallocatedMicros}
            testId="unallocated-balance"
            note={pending > 0 ? `${pending} top-up${pending === 1 ? " is" : "s are"} still confirming. This updates by itself.` : "Ready to give to an agent from its page."}
          >
            <ButtonLink href="/business/agents" variant="secondary" onInk>
              Give money to an agent
            </ButtonLink>
          </BalancePanel>
          <TopupForm />
        </div>
        <section aria-labelledby="topups-title">
          <h2 id="topups-title" className="mb-4 font-display text-2xl text-ink">
            Top-ups
          </h2>
          <TopupsTable rows={topups} />
        </section>
      </SectionReveal>
    </>
  );
}
