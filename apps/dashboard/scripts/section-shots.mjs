// Element screenshots of /styleguide sections, for close review.
// Usage: node scripts/section-shots.mjs [width] [ids,comma,separated]
import { chromium } from "@playwright/test";
const width = Number(process.argv[2] ?? 1440);
const ids = (process.argv[3] ?? "gate-lane,tickets,money,fields").split(",");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
await p.goto("http://localhost:3000/styleguide", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
for (const id of ids) {
  const el = p.locator(`#${id}`);
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await el.screenshot({ path: new URL(`../.screenshots/sg-${id}-${width}.png`, import.meta.url).pathname });
}
await b.close();
