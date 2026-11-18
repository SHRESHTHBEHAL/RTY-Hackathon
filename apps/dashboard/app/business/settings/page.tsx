import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { KeysPanel } from "@/components/business/KeysPanel";
import { LoadError } from "@/components/business/LoadError";
import { load } from "../data";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const res = await load(async (gw) => {
    const [keys, hook] = await Promise.all([gw.listKeys({ limit: 200 }), gw.getPolicyHook()]);
    return { keys: keys.data, hook: hook.url };
  });
  const header = <PageHeader eyebrow="Business" title="Settings" description="Keys for your own servers, and an optional check your server can run before any payment." />;
  if (!res.ok) {
    return (
      <>
        {header}
        <LoadError title="Settings did not load" message={res.message} />
      </>
    );
  }
  return (
    <>
      {header}
      <SectionReveal className="flex flex-col gap-6">
        <KeysPanel
          keys={res.data.keys}
          scope={{ type: "business" }}
          title="Business API keys"
          description="These keys act as your business: they can create agents and move money. Agents have their own keys on their pages."
        />
        <Link
          href="/business/settings/policy"
          className="pressable group flex items-center gap-4 rounded-[14px] border border-line bg-card p-5 hover-fine:border-ink sm:p-6"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-ink">
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Policy hook</span>
            <span className="block truncate text-[15px] text-ink-soft">
              {res.data.hook ? <span className="font-mono text-[14px]">{res.data.hook}</span> : "Off. Let your server allow, hold, or block payments."}
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-soft transition-transform duration-[var(--dur-quick)] group-hover-fine:translate-x-0.5" />
        </Link>
      </SectionReveal>
    </>
  );
}
