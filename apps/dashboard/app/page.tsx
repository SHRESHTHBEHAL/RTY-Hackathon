import { redirect } from "next/navigation";
import { getAccount } from "@/lib/session";

/** Until the public landing page exists (Task 8), send people where they belong. */
export default async function Home() {
  const session = await getAccount().catch(() => null);
  if (!session) redirect("/login");
  redirect(session.account.kind === "business" ? "/business" : "/seller");
}
