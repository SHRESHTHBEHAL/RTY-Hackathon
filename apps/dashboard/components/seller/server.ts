import "server-only";
import { redirect } from "next/navigation";
import { GaitwayError, humanError } from "@/lib/api/errors";
import type { GaitwayApi } from "@/lib/api/client";
import { sessionApi } from "@/lib/session";
import type { ActionResult, ChartDay, OverviewData } from "./result";

/** Run a call with the session client and turn an API failure into data. */
export async function attempt<T>(fn: (gw: GaitwayApi) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(await sessionApi()) };
  } catch (e) {
    if (e instanceof GaitwayError) {
      const field = typeof e.details?.field === "string" ? e.details.field : undefined;
      return { ok: false, code: e.code, message: humanError(e), field };
    }
    throw e;
  }
}

/** For server components: an ended session goes to log-in, other API errors come back as data. */
export async function loadData<T>(fn: (gw: GaitwayApi) => Promise<T>): Promise<ActionResult<T>> {
  const r = await attempt(fn);
  if (!r.ok && r.code === "unauthorized") redirect("/login");
  return r;
}

export async function fetchOverview(gw: GaitwayApi): Promise<OverviewData> {
  const [bal, recent] = await Promise.all([gw.getSellerBalance(), gw.listCharges({ limit: 8 })]);
  return { owedMicros: bal.owedMicros, paidOutMicros: bal.paidOutMicros, recent: recent.data };
}

const DAY_MS = 86_400_000;

/** Charges per UTC day for the last seven days, today last. Counts real charges only. */
export async function fetchChartDays(gw: GaitwayApi, now = Date.now()): Promise<ChartDay[]> {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const start = today - 6 * DAY_MS;
  const counts = new Array<number>(7).fill(0);
  let cursor: string | undefined;
  for (let page = 0; page < 12; page++) {
    const res = await gw.listCharges({ limit: 200, cursor });
    let oldest = Infinity;
    for (const c of res.data) {
      const t = Date.parse(c.createdAt);
      oldest = Math.min(oldest, t);
      if (t >= start && t < today + DAY_MS) counts[Math.floor((t - start) / DAY_MS)]! += 1;
    }
    if (!res.nextCursor || oldest < start) break;
    cursor = res.nextCursor;
  }
  return counts.map((count, i) => ({ day: new Date(start + i * DAY_MS).toISOString().slice(0, 10), count }));
}

/** The contract has no "get one charge" route, so walk the list until it turns up. */
export async function findCharge(gw: GaitwayApi, id: string) {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await gw.listCharges({ limit: 200, cursor });
    const hit = res.data.find((c) => c.id === id);
    if (hit) return hit;
    if (!res.nextCursor) return null;
    cursor = res.nextCursor;
  }
  return null;
}
