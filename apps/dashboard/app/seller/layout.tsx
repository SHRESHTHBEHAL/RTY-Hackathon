import { SellerShell } from "@/components/SellerShell";
import { requireAccount } from "@/lib/session";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const { account } = await requireAccount("seller");
  return <SellerShell account={{ name: account.name, email: account.email }}>{children}</SellerShell>;
}
