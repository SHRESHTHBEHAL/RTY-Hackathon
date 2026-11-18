import { redirect } from "next/navigation";
import { Flow } from "@/components/public/Flow";
import { Hero } from "@/components/public/Hero";
import { Integrate } from "@/components/public/Integrate";
import { PublicFooter } from "@/components/public/PublicFooter";
import { Roles } from "@/components/public/Roles";
import { McpSection, StartSection, StatusSection } from "@/components/public/Sections";
import { getAccount } from "@/lib/session";
import { MotionUser } from "@/components/public/MotionUser";

export const metadata = {
  title: { absolute: "Gaitway · A payment gateway for AI agents" },
  description: "Give each of your agents a wallet. Sellers integrate Gaitway once, and agents pay them on their own, up to their balance.",
};

/** Logged-in visitors go to their dashboard; everyone else gets the landing page. */
export default async function Home() {
  const session = await getAccount().catch(() => null);
  if (session) redirect(session.account.kind === "business" ? "/business" : "/seller");
  return (
    <MotionUser>
      <a
        href="#hero-title"
        className="sr-only z-50 rounded-[10px] bg-pass px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <main>
        <Hero />
        <Roles />
        <Flow />
        <Integrate />
        <McpSection />
        <StatusSection />
        <StartSection />
      </main>
      <PublicFooter />
    </MotionUser>
  );
}
