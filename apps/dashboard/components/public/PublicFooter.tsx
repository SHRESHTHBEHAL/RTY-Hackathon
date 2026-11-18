import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { Logo } from "@/components/Logo";

const COLS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How a payment works" },
      { href: "/demo", label: "Live demo" },
      { href: "/sellers", label: "Seller directory" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs#seller-quickstart", label: "Seller quickstart" },
      { href: "/docs#agent-quickstart", label: "Agent quickstart" },
      { href: "/docs#mcp", label: "MCP server" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup?as=business", label: "Sign up as a business" },
      { href: "/signup?as=seller", label: "Sign up as a seller" },
      { href: "/login", label: "Log in" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="surface-ink relative overflow-hidden">
      <Guilloche variant="band" opacity={0.07} className="absolute inset-x-0 top-0 h-20 w-full text-go-bright" />
      <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 pb-10 pt-16 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo onInk />
          <p className="mt-4 max-w-xs text-[15px] text-on-ink-soft">A payment gateway for AI agents. Test mode only: no real money moves.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="eyebrow text-on-ink-soft!">{c.title}</h2>
            <ul className="mt-3 space-y-1">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center text-[15px] text-on-ink hover-fine:text-pass-bright">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="relative mx-auto max-w-[1200px] border-t border-ink-line px-4 py-5 text-sm text-on-ink-soft sm:px-6">
        Gaitway is a working name. Every balance on this site is test money.
      </div>
    </footer>
  );
}
