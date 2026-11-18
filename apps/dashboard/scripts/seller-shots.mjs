// Screenshots of every seller screen at 1440 and 375 wide (fixture mode).
// Usage: SHOT_PORT=3102 node scripts/seller-shots.mjs
import { chromium } from "@playwright/test";
const port = process.env.SHOT_PORT ?? "3102";
const base = `http://localhost:${port}`;
const out = (n) => new URL(`../.screenshots/seller/${n}.png`, import.meta.url).pathname;
const b = await chromium.launch();
for (const [tag, width, height] of [["1440", 1440, 900], ["375", 375, 812]]) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: tag === "375" ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(`${base}/login`);
  await p.getByLabel("Email").fill("team@relay.test");
  await p.getByLabel("Password", { exact: true }).fill("fixture-password");
  await p.getByRole("button", { name: "Log in" }).click();
  await p.waitForURL("**/seller");
  const shot = async (name, path) => {
    if (path) await p.goto(`${base}${path}`);
    await p.waitForTimeout(1100);
    await p.screenshot({ path: out(`${name}-${tag}`), fullPage: true });
  };
  await shot("overview");
  await shot("services", "/seller/services");
  await p.getByRole("button", { name: "Create service" }).click();
  await shot("services-dialog");
  await p.keyboard.press("Escape");
  await shot("charges", "/seller/charges");
  await p.goto(`${base}/seller/charges`);
  await p.getByRole("row").filter({ hasText: "None" }).first().getByRole("link").click();
  await shot("charge-detail");
  await p.getByRole("radio", { name: "Refund part of it" }).check();
  await p.getByLabel("Amount to refund").fill("0.5");
  await p.waitForTimeout(500);
  await shot("charge-refund-error");
  await p.getByLabel("Amount to refund").fill("0.004");
  await p.getByRole("button", { name: "Review refund" }).click();
  await shot("charge-refund-dialog");
  await p.keyboard.press("Escape");
  await shot("payouts", "/seller/payouts");
  await shot("payout-details", "/seller/payouts/details");
  await shot("subscriptions", "/seller/subscriptions");
  await shot("developers", "/seller/developers");
  await p.getByRole("button", { name: "Create key", exact: true }).click();
  await p.getByRole("dialog").getByLabel("Key name").fill("Screenshot key");
  await p.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
  await p.getByTestId("copy-once-value").waitFor();
  await shot("developers-key");
  await p.getByRole("button", { name: "I have saved it" }).click();
  await shot("webhooks", "/seller/developers/webhooks");
  await ctx.close();
}
await b.close();
