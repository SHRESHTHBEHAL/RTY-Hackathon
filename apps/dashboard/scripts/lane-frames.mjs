// Frame-by-frame capture of the GateLane journeys on /styleguide.
// Usage: node scripts/lane-frames.mjs [approved|refused|burst] [width]
import { chromium } from "@playwright/test";
const kind = process.argv[2] ?? "approved";
const width = Number(process.argv[3] ?? 1440);
const label = { approved: "Approved payment", refused: "Refused payment", burst: "Three at once" }[kind];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width, height: 900 }, reducedMotion: process.env.REDUCE ? "reduce" : "no-preference" });
await p.goto("http://localhost:3000/styleguide#gate-lane", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
const panel = p.locator("#gate-lane > div").nth(1);
await panel.scrollIntoViewIfNeeded();
await panel.getByRole("button", { name: label }).first().click();
for (let i = 0; i < 12; i++) {
  await panel.screenshot({ path: new URL(`../.screenshots/lane-${kind}-${width}-${String(i).padStart(2, "0")}.png`, import.meta.url).pathname });
  await p.waitForTimeout(90);
}
await b.close();
