// Screenshots of every business screen at 1440 and 375 wide (fixture mode).
// Usage: SHOT_PORT=3101 node scripts/business-shots.mjs
import { chromium } from "@playwright/test";
const port = process.env.SHOT_PORT ?? "3101";
const base = `http://localhost:${port}`;
const out = (n) => new URL(`../.screenshots/business/${n}.png`, import.meta.url).pathname;
const b = await chromium.launch();
for (const [tag, width, height] of [["1440", 1440, 900], ["375", 375, 812]]) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: tag === "375" ? 2 : 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[pageerror ${tag}]`, e.message.slice(0, 200)));
  await p.goto(`${base}/login`);
  await p.getByLabel("Email").fill("ops@acme.test");
  await p.getByLabel("Password", { exact: true }).fill("fixture-password");
  await p.getByRole("button", { name: "Log in" }).click();
  await p.waitForURL("**/business");
  const shot = async (name, path, wait = 1300) => {
    if (path) await p.goto(`${base}${path}`);
    await p.waitForTimeout(wait);
    await p.screenshot({ path: out(`${name}-${tag}`), fullPage: true });
  };
  await shot("overview");
  await shot("agents", "/business/agents");
  await p.getByRole("button", { name: "New agent" }).click();
  await p.getByLabel("Agent name").fill("Courier");
  await shot("agents-dialog", null, 600);
  await p.getByRole("button", { name: "Create agent" }).click();
  await p.getByTestId("copy-once-value").waitFor();
  await shot("agents-key", null, 600);
  await p.getByRole("button", { name: "Done" }).click();
  await p.goto(`${base}/business/agents`);
  await p.getByRole("link", { name: /^Scout/ }).first().click();
  await p.waitForURL(/agt_/);
  const agentUrl = p.url();
  await shot("agent-detail", null);
  await p.getByRole("button", { name: "Add money" }).first().click();
  await p.getByLabel("Amount").fill("500");
  await p.getByRole("dialog").getByRole("button", { name: "Add money" }).click();
  await shot("agent-add-error", null, 700);
  await p.keyboard.press("Escape");
  await shot("rules", `${agentUrl.replace(base, "")}/rules`);
  await shot("funds", "/business/funds");
  await shot("withdraw", "/business/funds/withdraw");
  await shot("activity", "/business/activity");
  await shot("subscriptions", "/business/subscriptions");
  await shot("settings", "/business/settings");
  await shot("policy", "/business/settings/policy");
  await ctx.close();
}
await b.close();
