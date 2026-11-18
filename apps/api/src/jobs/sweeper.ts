import type { Deps } from "../deps.js";
import { closeCredential, lockCredential } from "../credentials/service.js";

/** Releases the holds of active credentials past their expiry. Returns how many it released. */
export async function runSweeper(deps: Deps): Promise<number> {
  const now = deps.now();
  const due = await deps.sql<{ id: string }[]>`
    select id from credentials where status = 'active' and expires_at <= ${now} order by expires_at limit 500`;
  let n = 0;
  for (const { id } of due) {
    const did = await deps.sql.begin(async (tx) => {
      const r = await lockCredential(tx, id);
      if (!r || r.status !== "active" || r.expires_at.getTime() > now.getTime()) return false;
      await closeCredential(tx, r, "expired");
      return true;
    });
    if (did) n++;
  }
  return n;
}
