import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { BalancePanel } from "@/components/business/BalancePanel";
import { WithdrawForm, WithdrawalsTable } from "@/components/business/Funds";
import { LoadError } from "@/components/business/LoadError";
import { Poller } from "@/components/business/Poller";
import { load } from "../../data";

export const metadata = { title: "Withdraw" };

export default async function WithdrawPage() {
  const res = await load(async (gw) => {
    const [balance, withdrawals] = await Promise.all([gw.getBalance(), gw.listWithdrawals({ limit: 50 })]);
    return { balance, withdrawals: withdrawals.data };
  });
  const header = (
    <>
      <Link href="/business/funds" className="mb-5 inline-flex h-11 items-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-ink-soft hover-fine:text-ink">
        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        Funds
      </Link>
      <PageHeader eyebrow="Funds" title="Withdraw" description="Take money out of Gaitway from your unallocated balance." />
    </>
  );
  if (!res.ok) {
    return (
      <>
        {header}
        <LoadError title="Withdrawals did not load" message={res.message} />
      </>
    );
  }
  const { balance, withdrawals } = res.data;
  return (
    <>
      <Poller />
      {header}
      <SectionReveal className="flex flex-col gap-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BalancePanel label="Unallocated balance" micros={balance.unallocatedMicros} testId="unallocated-balance" note="The most you can withdraw right now." />
          <WithdrawForm unallocatedMicros={balance.unallocatedMicros} />
        </div>
        <section aria-labelledby="wd-title">
          <h2 id="wd-title" className="mb-4 font-display text-2xl text-ink">
            Withdrawals
          </h2>
          <WithdrawalsTable rows={withdrawals} />
        </section>
      </SectionReveal>
    </>
  );
}
