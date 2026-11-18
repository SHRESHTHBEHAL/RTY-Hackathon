"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/sellers", label: "Sellers" },
  { href: "/demo", label: "Live demo" },
];

/** Top bar for the public site. `onInk` over the landing hero, paper elsewhere. */
export function PublicNav({ onInk = false, current: given }: { onInk?: boolean; current?: string }) {
  // The pathname is read after hydration: layouts can render it as null on the server.
  const pathname = usePathname();
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => setPath(pathname), [pathname]);
  const current = given ?? (path ? LINKS.find((l) => l.href !== "/#how" && (path === l.href || path.startsWith(`${l.href}/`)))?.href : undefined);
  return (
    <header className={cn("relative z-20", onInk ? "text-on-ink" : "border-b border-line bg-paper/90 text-ink backdrop-blur-[6px]")}>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 sm:h-[72px] sm:px-6">
        <Link href="/" className="-ml-1 mr-4 rounded-[8px] p-1" aria-label="Gaitway home">
          <Logo onInk={onInk} />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                className={cn(
                  "pressable inline-flex h-11 items-center rounded-[10px] px-3 text-[15px] font-medium",
                  onInk ? "text-on-ink-soft hover-fine:text-on-ink" : "text-ink-soft hover-fine:text-ink",
                  current === l.href && (onInk ? "text-on-ink" : "text-ink"),
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className={cn(
              "pressable inline-flex h-11 items-center rounded-[10px] px-3 text-[15px] font-medium",
              onInk ? "text-on-ink hover-fine:bg-white/8" : "text-ink hover-fine:bg-ink/6",
            )}
          >
            Log in
          </Link>
          <ButtonLink href="/signup" className="px-3.5 sm:px-4">
            Sign up
          </ButtonLink>
        </div>
      </nav>
      {/* Phone: the same links, as a row under the bar */}
      <ul className={cn("flex gap-1 overflow-x-auto px-3 pb-2 md:hidden", onInk ? "" : "")}>
        {LINKS.map((l) => (
          <li key={l.href} className="shrink-0">
            <Link
              href={l.href}
              className={cn(
                "inline-flex h-11 items-center rounded-[10px] px-3 text-sm font-medium",
                onInk ? "text-on-ink-soft" : "text-ink-soft",
                current === l.href && (onInk ? "text-on-ink" : "text-ink"),
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </header>
  );
}
