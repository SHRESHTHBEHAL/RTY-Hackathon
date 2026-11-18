import { DemoScreen } from "@/components/demo/DemoScreen";
import { MotionUser } from "@/components/public/MotionUser";
import { humanError } from "@/lib/api/errors";
import { DemoConfigError, readSnapshot } from "./server";
import type { DemoSnapshot } from "./types";

export const metadata = { title: "Live demo" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  let initial: DemoSnapshot | null = null;
  let error: string | null = null;
  try {
    initial = await readSnapshot();
  } catch (e) {
    error = e instanceof DemoConfigError ? e.message : humanError(e);
  }
  return (
    <MotionUser>
      <DemoScreen initial={initial} initialError={error} />
    </MotionUser>
  );
}
