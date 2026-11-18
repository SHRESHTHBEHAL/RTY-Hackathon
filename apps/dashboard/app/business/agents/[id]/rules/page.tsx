import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { LoadError } from "@/components/business/LoadError";
import { RulesForm } from "@/components/business/RulesForm";
import { load } from "../../../data";

export const metadata = { title: "Spending rules" };

export default async function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await load(async (gw) => {
    const [{ agent }, { rules }, sellers] = await Promise.all([gw.getAgent(id), gw.getAgentRules(id), gw.listSellers({ limit: 200 })]);
    return { agent, rules, sellers: sellers.data };
  });
  if (!res.ok && res.code === "not_found") notFound();

  const back = (
    <Link href={`/business/agents/${id}`} className="mb-5 inline-flex h-11 items-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-ink-soft hover-fine:text-ink">
      <ArrowLeft size={16} strokeWidth={2} aria-hidden />
      {res.ok ? res.data.agent.name : "Back to agent"}
    </Link>
  );

  if (!res.ok) {
    return (
      <>
        {back}
        <PageHeader eyebrow="Agent" title="Spending rules" />
        <LoadError title="The rules did not load" message={res.message} />
      </>
    );
  }
  const { agent, rules, sellers } = res.data;
  return (
    <>
      {back}
      <PageHeader
        eyebrow={`${agent.name} · spending rules`}
        title="Spending rules"
        description={`Limits Gaitway checks before ${agent.name} can reserve or spend money. The balance on its pass is always the outer limit.`}
      />
      <SectionReveal>
        <RulesForm agentId={agent.id} agentName={agent.name} rules={rules} sellers={sellers} />
      </SectionReveal>
    </>
  );
}
