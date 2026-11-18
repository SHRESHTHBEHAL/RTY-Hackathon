import { SignupForm } from "./SignupForm";

export const metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  return <SignupForm initialKind={as === "seller" ? "seller" : "business"} />;
}
