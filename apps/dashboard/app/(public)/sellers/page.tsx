import { ArrowUpRight, Store } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { PublicError } from "@/components/public/RetryButton";
import { SellerSearch } from "@/components/public/SellerSearch";
import { TicketCard } from "@/components/TicketCard";
import { api } from "@/lib/api/client";
import { humanError } from "@/lib/api/errors";
import type { Seller } from "@/lib/api/types";
import { shortId } from "@/lib/format";

export const metadata = { title: "Sellers", description: "Services that accept payment from AI agents through Gaitway." };
export const dynamic = "force-dynamic";

export default async function SellersPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
  const { query = "" } = await searchParams;
  let sellers: Seller[] | null = null;
  let error: string | null = null;
  try {
    sellers = (await api(null).listSellers({ query: query.trim() || undefined, limit: 100 })).data;
  } catch (e) {
    error = humanError(e);
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-8 border-b border-line pb-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="eyebrow">Seller directory</p>
          <h1 className="font-display mt-3 text-[48px] text-ink sm:text-[72px]">Where agents can pay</h1>
          <p className="mt-4 text-lg text-ink-soft">
            Services that accept Gaitway. Agents find them here, or with <code className="font-mono text-[0.9em]">agent.findSellers()</code>.
          </p>
        </div>
        <SellerSearch initial={query} />
      </header>

      <div className="pt-10" aria-live="polite">
        {error ? (
          <PublicError title="The directory did not load" message={error} />
        ) : sellers && sellers.length === 0 ? (
          <div className="rounded-[14px] border border-line bg-card">
            <EmptyState
              icon={Store}
              title={query ? `No sellers match “${query}”` : "No sellers listed yet"}
              body={query ? "Try another word, or clear the search." : "Sellers appear here once they add an active service."}
              action={
                <Link href="/signup?as=seller" className="inline-flex min-h-11 items-center font-semibold text-pass">
                  List your service: sign up as a seller
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-ink-soft">
              {sellers!.length} {sellers!.length === 1 ? "seller" : "sellers"}
              {query ? ` matching “${query}”` : ""}
            </p>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="seller-list">
              {sellers!.map((s) => (
                <li key={s.id}>
                  <Link href={`/sellers/${s.id}`} className="group block rounded-[14px]">
                    <TicketCard
                      tone="card"
                      interactive
                      className="h-full"
                      bodyClassName="p-5"
                      stub={
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="font-mono text-xs">{shortId(s.id)}</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-pass">
                            View services
                            <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden className="transition-transform duration-200 group-hover-fine:-translate-y-0.5 group-hover-fine:translate-x-0.5" />
                          </span>
                        </span>
                      }
                    >
                      <h2 className="font-display text-[32px] text-ink">{s.name}</h2>
                      <p className="mt-1 text-[15px] text-ink-soft">
                        {s.services.length} {s.services.length === 1 ? "service" : "services"}
                      </p>
                      <ul className="mt-4 space-y-2">
                        {s.services.slice(0, 3).map((x) => (
                          <li key={x.id} className="flex items-baseline justify-between gap-3 border-t border-line pt-2 text-[15px]">
                            <span className="truncate text-ink">{x.name}</span>
                            <span className="shrink-0 font-mono text-[13px] text-ink-soft">{x.priceNote}</span>
                          </li>
                        ))}
                      </ul>
                    </TicketCard>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
