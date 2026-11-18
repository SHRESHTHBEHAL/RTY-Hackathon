import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyOnce";
import { CodeBlock } from "@/components/public/CodeBlock";
import { PublicError } from "@/components/public/RetryButton";
import { TicketCard } from "@/components/TicketCard";
import { api } from "@/lib/api/client";
import { GaitwayError, humanError } from "@/lib/api/errors";
import type { Seller } from "@/lib/api/types";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<{ seller: Seller | null; error: string | null }> {
  try {
    return { seller: (await api(null).getSeller(id)).seller, error: null };
  } catch (e) {
    if (e instanceof GaitwayError && e.code === "not_found") notFound();
    return { seller: null, error: humanError(e) };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { seller } = await load(id).catch(() => ({ seller: null }));
  return { title: seller ? `${seller.name} · Sellers` : "Seller" };
}

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { seller, error } = await load(id);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/sellers" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-ink-soft hover-fine:text-ink">
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
        All sellers
      </Link>

      {error || !seller ? (
        <div className="mt-6">
          <PublicError title="This seller did not load" message={error ?? "Try again in a moment."} />
        </div>
      ) : (
        <>
          <header className="mt-4 flex flex-col gap-4 border-b border-line pb-10 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow">Seller</p>
              <h1 className="font-display mt-3 text-[48px] text-ink sm:text-[72px]">{seller.name}</h1>
            </div>
            <div className="flex items-center gap-1 rounded-[10px] border border-line bg-card pl-3">
              <span className="font-mono text-sm text-ink">{seller.id}</span>
              <CopyButton value={seller.id} label="Copy seller ID" />
            </div>
          </header>

          <section aria-labelledby="services-title" className="pt-10">
            <h2 id="services-title" className="eyebrow">
              {seller.services.length} active {seller.services.length === 1 ? "service" : "services"}
            </h2>
            <ul className="mt-5 grid gap-5 md:grid-cols-2">
              {seller.services.map((s) => (
                <li key={s.id}>
                  <TicketCard
                    tone="card"
                    className="h-full"
                    bodyClassName="p-6"
                    stub={
                      <span className="flex w-full min-w-0 items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs">{s.url}</span>
                        <CopyButton value={s.url} label={`Copy the URL of ${s.name}`} />
                      </span>
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-[28px] text-ink">{s.name}</h3>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-go/30 bg-go/10 px-2.5 py-1 text-xs font-semibold text-go-text">
                        <Check size={14} strokeWidth={2.25} aria-hidden />
                        Active
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.description}</p>
                    <p className="mt-4 font-mono text-[15px] text-ink">{s.priceNote}</p>
                  </TicketCard>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="pay-title" className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <h2 id="pay-title" className="font-display text-[32px] text-ink">
                Pay {seller.name} from an agent
              </h2>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
                Call the service with <code className="font-mono text-[0.9em]">agent.fetch</code>. On its 402, the SDK opens a credential for this seller,
                pays, and retries once.
              </p>
            </div>
            <CodeBlock
              code={`const one = await agent.getSeller("${seller.id}");\nconst res = await agent.fetch("${seller.services[0]?.url ?? "https://…"}", {\n  method: "POST",\n  body: JSON.stringify({ text: "hello" }),\n});`}
              title="agent.ts"
            />
          </section>
        </>
      )}
    </div>
  );
}
