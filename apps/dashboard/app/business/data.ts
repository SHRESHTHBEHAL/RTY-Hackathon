import "server-only";
import { GaitwayError, humanError } from "@/lib/api/errors";
import { sessionApi } from "@/lib/session";

export type Loaded<T> = { ok: true; data: T } | { ok: false; message: string; code: string };

/**
 * Runs the page's reads together. A failure becomes a message the page shows
 * with a retry, never a blank screen. "not_found" is passed through so the
 * page can call notFound().
 */
export async function load<T>(fn: (gw: Awaited<ReturnType<typeof sessionApi>>) => Promise<T>): Promise<Loaded<T>> {
  try {
    const gw = await sessionApi();
    return { ok: true, data: await fn(gw) };
  } catch (e) {
    if (e instanceof GaitwayError) {
      const message =
        e.code === "network_error" || e.code === "timeout" || e.code === "bad_response" || e.status >= 500
          ? "Gaitway did not answer in time. Check your connection, then try again."
          : humanError(e);
      return { ok: false, message, code: e.code };
    }
    console.error("[business load]", e);
    return { ok: false, message: "Something went wrong loading this page. Try again.", code: "unknown" };
  }
}
