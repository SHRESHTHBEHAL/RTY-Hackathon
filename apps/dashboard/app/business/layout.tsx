import { BusinessShell } from "@/components/BusinessShell";
import { requireAccount } from "@/lib/session";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const { account } = await requireAccount("business");
  return <BusinessShell account={{ name: account.name, email: account.email }}>{children}</BusinessShell>;
}
