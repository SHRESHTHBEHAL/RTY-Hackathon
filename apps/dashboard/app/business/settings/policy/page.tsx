import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { LoadError } from "@/components/business/LoadError";
import { PolicyForm } from "@/components/business/PolicyForm";
import { load } from "../../data";

export const metadata = { title: "Policy hook" };

const STEPS = [
  ["Ask", "Before an agent opens a payment session, subscribes, or pays a seller directly, and after its own spending rules pass, Gaitway sends your server the agent, seller and amount."],
  ["Answer", "Your server replies within 2 seconds with allow, hold, or block, and optional reasons and an approval link."],
  ["Decide", "Only a valid allow lets the payment through. Hold, block, a timeout or an error refuses it, and the agent sees your reasons."],
] as const;

export default async function PolicyPage() {
  const res = await load(async (gw) => (await gw.getPolicyHook()).url);
  return (
    <>
      <Link href="/business/settings" className="mb-5 inline-flex h-11 items-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-ink-soft hover-fine:text-ink">
        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        Settings
      </Link>
      <PageHeader eyebrow="Settings" title="Policy hook" description="Your own gate in front of every payment your agents try to make." />
      {res.ok ? (
        <SectionReveal className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <PolicyForm url={res.data} />
          <Card title="How it works">
            <ol className="flex flex-col gap-4">
              {STEPS.map(([t, b], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[13px] text-ink">{i + 1}</span>
                  <span>
                    <span className="block font-semibold text-ink">{t}</span>
                    <span className="block text-[15px] text-ink-soft">{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </SectionReveal>
      ) : (
        <LoadError title="The policy hook did not load" message={res.message} />
      )}
    </>
  );
}
