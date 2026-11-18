import { expect, test, type Locator, type Page } from "@playwright/test";
import { dollarsToMicros } from "../lib/format";

const BUSINESS = { email: "ops@acme.test", password: "fixture-password" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(BUSINESS.email);
  await page.getByLabel("Password", { exact: true }).fill(BUSINESS.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
}

/** The full amount as plain text: Money keeps it in a screen-reader span. */
async function amountIn(scope: Locator): Promise<bigint> {
  const text = (await scope.locator(".sr-only").first().textContent())!.trim();
  return BigInt(dollarsToMicros(text.replace(/^[+-]/, ""))!);
}

const usd = (d: string) => BigInt(dollarsToMicros(d)!);

/** Create an agent through the dialog. Returns its id, taken from the page it opens. */
async function createAgent(page: Page, name: string): Promise<string> {
  await page.goto("/business/agents");
  await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
  await page.getByRole("button", { name: "New agent" }).click();
  const dialog = page.getByRole("dialog", { name: "New agent" });
  await dialog.getByLabel("Agent name").fill(name);
  await dialog.getByRole("button", { name: "Create agent" }).click();
  const ready = page.getByRole("dialog", { name: `${name} is ready` });
  await expect(ready.getByTestId("copy-once-value")).toContainText("gw_");
  await ready.getByRole("button", { name: `Open ${name}` }).click();
  await expect(page).toHaveURL(/\/business\/agents\/agt_/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/").pop()!;
}

async function unallocated(page: Page): Promise<bigint> {
  await page.goto("/business");
  return amountIn(page.getByTestId("unallocated-balance"));
}

/** Add money to the agent whose page is open. */
async function addMoney(page: Page, name: string, dollars: string) {
  await page.getByRole("button", { name: "Add money" }).first().click();
  const dialog = page.getByRole("dialog", { name: `Add money to ${name}` });
  await dialog.getByLabel("Amount").fill(dollars);
  await dialog.getByRole("button", { name: "Add money" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("tasks 6 and 11: business screens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("three agents, a confirmed top-up, allocations, errors, disable, activity filter, rules", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const names = [`Alpha ${stamp}`, `Bravo ${stamp}`, `Charlie ${stamp}`];
    const ids: string[] = [];
    for (const n of names) ids.push(await createAgent(page, n));

    // Top up 100 dollars and watch it confirm.
    const before = await unallocated(page);
    await page.goto("/business/funds");
    await expect(page.getByText("Test mode").first()).toBeVisible();
    await page.getByLabel("Amount", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Top up with test money" }).click();
    const topups = page.getByRole("table", { name: "Top-ups" });
    await expect(topups.getByText("Pending").first()).toBeVisible();
    await expect(topups.getByText("Pending")).toHaveCount(0, { timeout: 15_000 });
    await expect(topups.getByText("Confirmed").first()).toBeVisible();
    await expect.poll(async () => amountIn(page.getByTestId("unallocated-balance")), { timeout: 10_000 }).toBe(before + usd("100"));

    // Allocate 50, 30, and 0.
    await page.goto(`/business/agents/${ids[0]}`);
    await addMoney(page, names[0]!, "50");
    await page.goto(`/business/agents/${ids[1]}`);
    await addMoney(page, names[1]!, "30");
    await page.goto(`/business/agents/${ids[2]}`);
    await page.getByRole("button", { name: "Add money" }).first().click();
    const zero = page.getByRole("dialog", { name: `Add money to ${names[2]}` });
    await zero.getByLabel("Amount").fill("0");
    await zero.getByRole("button", { name: "Add money" }).click();
    await expect(zero.getByRole("alert")).toContainText("more than zero");
    await zero.getByRole("button", { name: "Cancel" }).click();
    await expect(zero).toBeHidden();

    // The overview shows unallocated and each pass.
    await page.goto("/business");
    await expect.poll(async () => amountIn(page.getByTestId("unallocated-balance")), { timeout: 10_000 }).toBe(before + usd("100") - usd("80"));
    expect(await amountIn(page.getByTestId(`pass-available-${names[0]}`))).toBe(usd("50"));
    expect(await amountIn(page.getByTestId(`pass-available-${names[1]}`))).toBe(usd("30"));
    expect(await amountIn(page.getByTestId(`pass-available-${names[2]}`))).toBe(0n);
    // The feed names agents, never raw wallet IDs.
    const feed = page.getByRole("list", { name: "Recent activity" });
    await expect(feed).toContainText(names[1]!);
    await expect(feed).not.toContainText("wal_");

    // Allocating 500 is refused inline, in plain words.
    await page.goto(`/business/agents/${ids[0]}`);
    await page.getByRole("button", { name: "Add money" }).first().click();
    const big = page.getByRole("dialog", { name: `Add money to ${names[0]}` });
    await big.getByLabel("Amount").fill("500");
    await big.getByRole("button", { name: "Add money" }).click();
    await expect(big.getByRole("alert")).toContainText(/not enough unallocated balance/i);
    await expect(big).toBeVisible();
    await big.getByRole("button", { name: "Cancel" }).click();

    // A double-click on the submit button sends one request.
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"]) posts.push(r.url());
    });
    await page.getByRole("button", { name: "Add money" }).first().click();
    const dbl = page.getByRole("dialog", { name: `Add money to ${names[0]}` });
    await dbl.getByLabel("Amount").fill("1");
    await dbl.getByRole("button", { name: "Add money" }).dblclick();
    await expect(dbl).toBeHidden();
    await expect(page.getByTestId(`pass-available-${names[0]}`)).toBeVisible();
    expect(posts).toHaveLength(1);
    await expect.poll(async () => amountIn(page.getByTestId(`pass-available-${names[0]}`)), { timeout: 10_000 }).toBe(usd("51"));

    // Take money back rolls the pass down.
    await page.getByRole("button", { name: "Take money back" }).first().click();
    const back = page.getByRole("dialog", { name: `Take money back from ${names[0]}` });
    await back.getByLabel("Amount").fill("1");
    await back.getByRole("button", { name: "Take money back" }).click();
    await expect(back).toBeHidden();
    await expect.poll(async () => amountIn(page.getByTestId(`pass-available-${names[0]}`)), { timeout: 10_000 }).toBe(usd("50"));

    // Spending rule: set a per-payment cap and see it saved.
    await page.getByRole("link", { name: /Set rules|Edit rules/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Spending rules" })).toBeVisible();
    await page.getByLabel("Per-payment limit").fill("5");
    await page.getByRole("button", { name: "Save rules" }).click();
    await page.goto(`/business/agents/${ids[0]}`);
    await expect(page.getByTestId("rules-summary")).toContainText("$5.00 per payment");
    await page.goto(`/business/agents/${ids[0]}/rules`);
    await expect(page.getByLabel("Per-payment limit")).toHaveValue("5");

    // A bad rule explains itself.
    await page.getByLabel("Per-payment limit").fill("abc");
    await page.getByRole("button", { name: "Save rules" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "numbers only" })).toBeVisible();

    // Disable an agent and see it disabled.
    await page.goto(`/business/agents/${ids[2]}`);
    await page.getByRole("button", { name: "Disable agent" }).click();
    await page.getByRole("dialog", { name: `Disable ${names[2]}?` }).getByRole("button", { name: "Disable agent" }).click();
    await expect(page.getByRole("button", { name: "Enable agent" })).toBeVisible();
    await expect(page.getByText("Disabled").first()).toBeVisible();
    await page.goto("/business/agents");
    await expect(page.getByRole("row").filter({ hasText: names[2]! }).getByText("Disabled")).toBeVisible();

    // Activity filters by agent.
    await page.goto("/business/activity");
    const all = page.getByRole("table", { name: "All transactions" });
    await expect(all).toContainText(names[0]!);
    await expect(all).toContainText(names[1]!);
    await page.getByRole("link", { name: names[1]!, exact: true }).click();
    await expect(page).toHaveURL(/agent=agt_/);
    const one = page.getByRole("table", { name: `${names[1]}'s transactions` });
    await expect(one).toContainText(`Added money to ${names[1]}`);
    await expect(one).not.toContainText(names[0]!);
    await expect(page.getByRole("link", { name: names[1]!, exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("a withdrawal above the unallocated balance is refused inline", async ({ page }) => {
    await page.goto("/business/funds/withdraw");
    await expect(page.getByRole("heading", { level: 1, name: "Withdraw" })).toBeVisible();
    await page.getByLabel("Amount", { exact: true }).fill("9999999");
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /not enough unallocated balance/i })).toBeVisible();
  });

  test("a subscription can be revoked, or the empty state shows", async ({ page }) => {
    await page.goto("/business/subscriptions");
    await expect(page.getByRole("heading", { level: 1, name: "Subscriptions" })).toBeVisible();
    const revoke = page.getByRole("button", { name: /^Revoke / });
    if ((await revoke.count()) === 0) {
      const table = page.getByRole("table", { name: "Subscriptions" });
      const rows = await table.getByRole("row").count();
      if (rows <= 1) await expect(page.getByText("No subscriptions")).toBeVisible();
      else await expect(table.getByText("Revoked", { exact: true }).locator("visible=true").first()).toBeVisible();
      return;
    }
    const before = await revoke.count();
    await revoke.first().click();
    const dialog = page.getByRole("dialog", { name: "Revoke this subscription?" });
    await dialog.getByRole("button", { name: "Revoke subscription" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /^Revoke / })).toHaveCount(before - 1);
    await expect(page.getByRole("table", { name: "Subscriptions" }).getByText("Revoked", { exact: true }).locator("visible=true").first()).toBeVisible();
  });

  test("business keys: create shows the key once, revoke asks first", async ({ page }) => {
    const label = `Key ${Date.now().toString(36)}`;
    await page.goto("/business/settings");
    await page.getByRole("button", { name: "Create key", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create key" });
    await dialog.getByLabel("Key name").fill(label);
    await dialog.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByRole("dialog", { name: "Copy your new key" }).getByTestId("copy-once-value")).toContainText("gw_");
    await page.getByRole("button", { name: "Done" }).click();
    const item = page.getByRole("listitem").filter({ hasText: label });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: `Revoke ${label}` }).click();
    await page.getByRole("dialog", { name: `Revoke ${label}?` }).getByRole("button", { name: "Revoke key" }).click();
    await expect(item).toHaveCount(0);
  });

  test("policy hook: an address shows its secret once", async ({ page }) => {
    await page.goto("/business/settings/policy");
    await page.getByLabel("URL").fill("not a url");
    await page.getByRole("button", { name: "Save hook" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "https://" })).toBeVisible();
    await page.getByLabel("URL").fill("https://example.test/gaitway/policy");
    await page.getByRole("button", { name: "Save hook" }).click();
    await expect(page.getByTestId("copy-once-value")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("copy-once-value")).toHaveCount(0);
    await expect(page.getByLabel("URL")).toHaveValue("https://example.test/gaitway/policy");
  });

  test("no sideways scroll at 375px on any business page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/business/agents");
    const href = await page.getByRole("link", { name: /^(Alpha|Scout|Buyer|Broke)/ }).first().getAttribute("href");
    const paths = ["/business", "/business/agents", href!, `${href}/rules`, "/business/funds", "/business/funds/withdraw", "/business/activity", "/business/subscriptions", "/business/settings", "/business/settings/policy"];
    for (const p of paths) {
      await page.goto(p);
      await page.waitForTimeout(900);
      const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(w.s, `${p} scrolls sideways`).toBeLessThanOrEqual(w.c);
    }
  });
});
