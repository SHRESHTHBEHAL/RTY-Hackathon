"use client";

import { Activity, Bot, LayoutGrid, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Shell, type NavItem, type ShellAccount } from "./Shell";

export const BUSINESS_NAV: NavItem[] = [
  { href: "/business", label: "Overview", icon: LayoutGrid },
  { href: "/business/agents", label: "Agents", icon: Bot },
  { href: "/business/funds", label: "Funds", icon: Wallet },
  { href: "/business/activity", label: "Activity", icon: Activity },
  { href: "/business/settings", label: "Settings", icon: Settings },
];

/** Frame for every /business page. Rendered by app/business/layout.tsx. */
export function BusinessShell({ account, testMode = true, children }: { account: ShellAccount; testMode?: boolean; children: ReactNode }) {
  return (
    <Shell area="business" nav={BUSINESS_NAV} account={account} testMode={testMode}>
      {children}
    </Shell>
  );
}
