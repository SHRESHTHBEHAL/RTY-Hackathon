"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, Menu as MenuIcon, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/cn";
import { TestModeBadge } from "./Badge";
import { Guilloche } from "./Guilloche";
import { Logo } from "./Logo";
import { Menu } from "./Popover";
import { DUR, EASE_OUT, exitOf } from "./motion-tokens";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export type ShellAccount = { name: string; email: string };

export type ShellProps = {
  /** Which dashboard; names the section and keeps the indicators separate. */
  area: "business" | "seller";
  nav: NavItem[];
  account: ShellAccount;
  /** Shows the test-mode badge. M1 is always test. */
  testMode?: boolean;
  children: ReactNode;
};

function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Dashboard frame: an ink sidebar 248px wide (logo, navigation, test-mode
 * badge, account at the bottom) beside a paper content area up to 1120px.
 * Below 900px the sidebar becomes a top bar with a menu sheet. The active
 * marker slides between items.
 */
export function Shell({ area, nav, account, testMode = true, children }: ShellProps) {
  const pathname = usePathname();
  const root = `/${area}`;
  const [sheet, setSheet] = useState(false);
  const reduce = useReducedMotion();

  // Close the sheet on navigation.
  useEffect(() => setSheet(false), [pathname]);

  return (
    <div className="min-h-dvh bg-paper">
      <a
        href="#main"
        className="sr-only z-[70] rounded-[10px] bg-pass px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="surface-ink fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-hidden nav:flex" aria-label="Sidebar">
        <Guilloche variant="seal" size={420} opacity={0.07} className="absolute -bottom-40 -left-40 text-on-ink-soft" />
        <div className="relative flex h-16 items-center px-5">
          <Link href={root} className="rounded-[8px]" aria-label="Gaitway home">
            <Logo onInk />
          </Link>
        </div>
        <div className="relative px-5 pb-4">
          <p className="eyebrow text-on-ink-soft!">{area === "business" ? "Business" : "Seller"}</p>
          <p className="mt-1 truncate text-[15px] font-semibold text-on-ink" title={account.name}>
            {account.name}
          </p>
        </div>
        <NavList nav={nav} pathname={pathname} root={root} layoutKey={`${area}-side`} reduce={reduce ?? false} />
        <div className="relative mt-auto flex flex-col gap-3 p-3">
          {testMode ? (
            <div className="px-2">
              <TestModeBadge onInk />
            </div>
          ) : null}
          <AccountMenu account={account} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="surface-ink sticky top-0 z-40 flex h-14 items-center justify-between gap-3 px-4 nav:hidden">
        <Link href={root} className="rounded-[8px]" aria-label="Gaitway home">
          <Logo onInk />
        </Link>
        <div className="flex items-center gap-2">
          {testMode ? <TestModeBadge onInk /> : null}
          <button
            type="button"
            onClick={() => setSheet((v) => !v)}
            aria-expanded={sheet}
            aria-controls="nav-sheet"
            aria-label={sheet ? "Close menu" : "Open menu"}
            className="pressable -mr-2 flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-on-ink hover-fine:bg-white/8"
          >
            {sheet ? <X size={22} strokeWidth={1.75} /> : <MenuIcon size={22} strokeWidth={1.75} />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {sheet ? (
          <MobileSheet
            key="sheet"
            onClose={() => setSheet(false)}
            nav={nav}
            pathname={pathname}
            root={root}
            area={area}
            account={account}
            reduce={reduce ?? false}
          />
        ) : null}
      </AnimatePresence>

      <main id="main" tabIndex={-1} className="outline-none nav:pl-[248px]">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-8 sm:py-12">{children}</div>
      </main>
    </div>
  );
}

function NavList({
  nav,
  pathname,
  root,
  layoutKey,
  reduce,
}: {
  nav: NavItem[];
  pathname: string;
  root: string;
  layoutKey: string;
  reduce: boolean;
}) {
  return (
    <LayoutGroup id={layoutKey}>
      <nav aria-label="Main" className="relative px-3">
        <ul className="flex flex-col gap-0.5">
          {nav.map((item) => {
            const active = isActive(pathname, item.href, root);
            const Icon = item.icon;
            return (
              <li key={item.href} className="relative">
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-[10px] bg-white/[0.07]"
                    transition={reduce ? { duration: 0 } : { duration: DUR.standard, ease: EASE_OUT }}
                  >
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-pass-bright" />
                  </motion.span>
                ) : null}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "pressable relative flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium",
                    active ? "text-on-ink" : "text-on-ink-soft hover-fine:text-on-ink",
                  )}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </LayoutGroup>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function AccountMenu({ account }: { account: ShellAccount }) {
  return (
    <Menu
      side="top"
      align="start"
      width="trigger"
      onInk
      label="Account"
      header={<span className="block truncate">{account.email}</span>}
      items={[{ label: "Log out", icon: LogOut, onSelect: () => void logoutAction() }]}
      trigger={(props, open) => (
        <button
          type="button"
          {...props}
          className={cn(
            "pressable flex h-14 w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 text-left",
            open ? "bg-white/8" : "hover-fine:bg-white/6",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pass text-sm font-semibold text-white">{initials(account.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-on-ink">{account.name}</span>
            <span className="block truncate text-xs text-on-ink-soft">{account.email}</span>
          </span>
          <ChevronsUpDown size={16} strokeWidth={1.75} className="text-on-ink-soft" aria-hidden />
        </button>
      )}
    />
  );
}

function MobileSheet({
  onClose,
  nav,
  pathname,
  root,
  area,
  account,
  reduce,
}: {
  onClose: () => void;
  nav: NavItem[];
  pathname: string;
  root: string;
  area: ShellProps["area"];
  account: ShellAccount;
  reduce: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("a,button")?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-30 nav:hidden" id="nav-sheet">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-ink/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DUR.standard } }}
        exit={{ opacity: 0, transition: { duration: exitOf(DUR.standard) } }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="surface-ink relative origin-top overflow-hidden rounded-b-[18px] border-b border-ink-line px-3 pb-4 pt-2 shadow-pop"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } }}
        exit={reduce ? { opacity: 0, transition: { duration: exitOf(DUR.slow) } } : { opacity: 0, y: -12, transition: { duration: exitOf(DUR.slow), ease: EASE_OUT } }}
      >
        <div className="px-3 pb-3 pt-2">
          <p className="eyebrow text-on-ink-soft!">{area === "business" ? "Business" : "Seller"}</p>
          <p className="mt-1 truncate text-[15px] font-semibold text-on-ink">{account.name}</p>
        </div>
        <div className="-mx-3">
          <NavList nav={nav} pathname={pathname} root={root} layoutKey={`${area}-sheet`} reduce={reduce} />
        </div>
        <div className="mx-3 my-3 h-px bg-ink-line" />
        <div className="flex items-center justify-between gap-3 px-3">
          <span className="min-w-0 truncate text-sm text-on-ink-soft">{account.email}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="pressable flex h-11 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[15px] font-medium text-on-ink hover-fine:bg-white/8"
            >
              <LogOut size={18} strokeWidth={1.75} aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
