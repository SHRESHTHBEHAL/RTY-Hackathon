import { NextResponse } from "next/server";
import { humanError } from "@/lib/api/errors";
import { DemoConfigError, readSnapshot } from "../server";

export const dynamic = "force-dynamic";

/** Polled about once a second by the presentation screen. Read-only; keys stay here. */
export async function GET() {
  try {
    return NextResponse.json(await readSnapshot(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const message = e instanceof DemoConfigError ? e.message : humanError(e);
    return NextResponse.json({ error: { message } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
