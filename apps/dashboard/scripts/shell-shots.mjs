// Screenshots of the dashboard shells, logged in with the fixture accounts.
// Usage: node scripts/shell-shots.mjs  (dev server running in fixture mode)
import { chromium } from "@playwright/test";
const out = (n) => new URL(`../.screenshots/${n}.png`, import.meta.url).pathname;
const b = await chromium.launch();
for (const [area, email] of [["business", "ops@acme.test"], ["seller", "team@relay.test"]]) {
  for (const [tag, width, height] of [["desktop", 1440, 900], ["phone", 375, 812]]) {
    const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: tag === "phone" ? 2 : 1 });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/login");
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password", { exact: true }).fill("fixture-password");
    await p.getByRole("button", { name: "Log in" }).click();
    await p.waitForURL(`**/${area}`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: out(`${area}-${tag}`) });
    if (tag === "phone") {
      await p.getByRole("button", { name: "Open menu" }).click();
      await p.waitForTimeout(600);
      await p.screenshot({ path: out(`${area}-${tag}-menu`) });
    } else {
      await p.getByRole("button", { name: /Acme Ops|Relay/ }).last().click();
      await p.waitForTimeout(500);
      await p.screenshot({ path: out(`${area}-${tag}-account`) });
    }
    await ctx.close();
  }
}
await b.close();
