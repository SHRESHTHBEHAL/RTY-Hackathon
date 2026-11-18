"use client";

import { Banknote, Code2, LayoutGrid, Package, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";
import { Shell, type NavItem, type ShellAccount } from "./Shell";

export const SELLER_NAV: NavItem[] = [
  { href: "/seller", label: "Overview", icon: LayoutGrid },
  { href: "/seller/services", label: "Services", icon: Package },
  { href: "/seller/charges", label: "Charges", icon: ReceiptText },
  { href: "/seller/payouts", label: "Payouts", icon: Banknote },
  { href: "/seller/developers", label: "Developers", icon: Code2 },
];

/** Frame for every /seller page. Rendered by app/seller/layout.tsx. */
export function SellerShell({ account, testMode = true, children }: { account: ShellAccount; testMode?: boolean; children: ReactNode }) {
  return (
    <Shell area="seller" nav={SELLER_NAV} account={account} testMode={testMode}>
      {children}
    </Shell>
  );
}
