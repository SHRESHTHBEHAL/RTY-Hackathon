import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <a
        href="#content"
        className="sr-only z-50 rounded-[10px] bg-pass px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <div className="sticky top-0 z-30">
        <PublicNav />
      </div>
      <main id="content" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
