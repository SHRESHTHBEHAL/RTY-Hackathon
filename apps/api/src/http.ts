import type { Context } from "hono";
import type { z } from "zod";
import { ApiError } from "./errors.js";

/** Reads and validates a JSON body; any problem is validation_failed. */
export async function readJson<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown = {};
  const text = await c.req.text();
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError("validation_failed", "Body must be JSON");
    }
  }
  const p = schema.safeParse(raw);
  if (!p.success) {
    const issues = p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new ApiError(
      "validation_failed",
      issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; "),
      { issues },
    );
  }
  return p.data;
}

export type ListParams = { cursor: bigint | null; limit: number };

/** `?cursor=&limit=`: default 50, maximum 200. Cursor is opaque (a sequence number). */
export function listParams(c: Context): ListParams {
  const l = c.req.query("limit");
  const cur = c.req.query("cursor");
  let limit = 50;
  if (l !== undefined && l !== "") {
    if (!/^[0-9]+$/.test(l) || Number(l) < 1 || Number(l) > 200) {
      throw new ApiError("validation_failed", "limit must be between 1 and 200");
    }
    limit = Number(l);
  }
  let cursor: bigint | null = null;
  if (cur !== undefined && cur !== "") {
    if (!/^[0-9]{1,18}$/.test(cur)) throw new ApiError("validation_failed", "Invalid cursor");
    cursor = BigInt(cur);
  }
  return { cursor, limit };
}

/** Rows must be fetched newest first with limit + 1 and carry `seq`. */
export function page<R extends { seq: bigint }, T>(rows: R[], limit: number, map: (r: R) => T) {
  const more = rows.length > limit;
  const slice = more ? rows.slice(0, limit) : rows;
  return {
    data: slice.map(map),
    nextCursor: more ? slice[slice.length - 1]!.seq.toString() : null,
  };
}

/** A cursor bound usable in SQL: rows with seq below this. */
export function seqBound(p: ListParams): bigint {
  return p.cursor ?? 9223372036854775807n;
}

export const iso = (d: Date | string) => new Date(d).toISOString();
