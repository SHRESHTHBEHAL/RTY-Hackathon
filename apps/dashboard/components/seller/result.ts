import type { ApiKey, Charge, Payout, Service } from "@/lib/api/types";

/** What every seller server action returns: plain data, never a thrown error. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; field?: string };

export type OverviewData = { owedMicros: string; paidOutMicros: string; recent: Charge[] };
export type ChartDay = { day: string; count: number };
export type ChargePage = { data: Charge[]; nextCursor: string | null };
export type { ApiKey, Charge, Payout, Service };
