// Screenshots of the key screens at desktop and phone width.
// Usage: start the dev server (pnpm dev), then `node scripts/screenshots.mjs [baseUrl]`.
// Output: apps/dashboard/.screenshots/ (git-ignored).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3000";
const out = fileURLToPath(new URL("../.screenshots/", import.meta.url));
await mkdir(out, { recursive: true });

const widths = [
  ["desktop", 1440, 900],
  ["phone", 375, 812],
];
const pages = (process.env.PAGES ?? "/login,/signup,/styleguide").split(",");

const browser = await chromium.launch();
for (const [tag, width, height] of widths) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: tag === "phone" ? 2 : 1 });
  const page = await ctx.newPage();
  for (const path of pages) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const name = path.replace(/^\//, "").replace(/\//g, "-") || "home";
    await page.screenshot({ path: `${out}${name}-${tag}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${name}-${tag}.png${overflow > 0 ? `  WARNING: ${overflow}px sideways overflow` : ""}`);
  }
  await ctx.close();
}
await browser.close();
