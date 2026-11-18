import { expect, test, type Page } from "@playwright/test";

/** The full amount, from the screen-reader text every Money renders. */
async function amount(page: Page, testId: string): Promise<string> {
  return ((await page.getByTestId(testId).locator(".sr-only").first().textContent()) ?? "").trim();
}

async function openFreshDemo(page: Page) {
  await page.goto("/demo");
  await expect(page.getByRole("article", { name: /Scout's pass/ })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Demo reset")).toBeVisible();
}

test.describe("presentation screen (fixtures)", () => {
  test("shows three agent passes and Relay", async ({ page }) => {
    await openFreshDemo(page);
    for (const name of ["Scout", "Buyer", "Broke"]) {
      await expect(page.getByRole("article", { name: new RegExp(`${name}'s pass`) })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Relay" })).toBeVisible();
    await expect(page.getByText("Test money only. No real money moves.")).toBeVisible();
  });

  test("running a funded agent moves five cents from its balance to Relay", async ({ page }) => {
    await openFreshDemo(page);
    expect(await amount(page, "balance-0")).toBe("$50.00");
    expect(await amount(page, "relay-owed")).toBe("$0.23");

    await page.getByRole("article", { name: /Scout's pass/ }).getByRole("button", { name: "Run agent" }).click();

    await expect.poll(() => amount(page, "relay-owed"), { timeout: 10_000 }).toBe("$0.28");
    await expect.poll(() => amount(page, "balance-0"), { timeout: 10_000 }).toBe("$49.95");
    await expect(page.getByText("Scout paid Relay $0.01").first()).toBeVisible();
    // Nothing is left on hold once the five messages are paid.
    await expect(page.getByRole("article", { name: /Scout's pass/ }).getByText("$0.00")).toBeVisible();
  });

  test("the empty-wallet agent is refused and nothing changes", async ({ page }) => {
    await openFreshDemo(page);
    const owedBefore = await amount(page, "relay-owed");
    await page.getByRole("article", { name: /Broke's pass/ }).getByRole("button", { name: "Run agent" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Not enough balance" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Broke has \$0\.00, so Gaitway refused the/).first()).toBeVisible();
    // Give any stray poll time to land, then check nothing moved.
    await page.waitForTimeout(1500);
    expect(await amount(page, "balance-2")).toBe("$0.00");
    expect(await amount(page, "relay-owed")).toBe(owedBefore);
  });

  test("the blocked payment shows its reason and moves no money", async ({ page }) => {
    await openFreshDemo(page);
    const owedBefore = await amount(page, "relay-owed");
    const scoutBefore = await amount(page, "balance-0");

    await page.keyboard.press("b");

    const alert = page.getByRole("alert").filter({ hasText: "per-payment limit" });
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText("$5.00 is over Scout's $2.00 per-payment limit. No money moved.");
    await page.waitForTimeout(1500);
    expect(await amount(page, "balance-0")).toBe(scoutBefore);
    expect(await amount(page, "relay-owed")).toBe(owedBefore);
  });

  test("presenter shortcuts: 1 runs Scout, R resets", async ({ page }) => {
    await openFreshDemo(page);
    await page.keyboard.press("1");
    await expect.poll(() => amount(page, "relay-owed"), { timeout: 10_000 }).toBe("$0.28");
    await page.keyboard.press("r");
    await expect.poll(() => amount(page, "relay-owed"), { timeout: 10_000 }).toBe("$0.23");
    expect(await amount(page, "balance-0")).toBe("$50.00");
  });
});

test.describe("public site", () => {
  test("the landing page has exactly one h1 and working sign-up links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("A payment gateway for AI agents");

    const business = page.getByRole("link", { name: "Sign up as a business" }).first();
    const seller = page.getByRole("link", { name: "Sign up as a seller" }).first();
    await expect(business).toHaveAttribute("href", "/signup?as=business");
    await expect(seller).toHaveAttribute("href", "/signup?as=seller");

    await seller.click();
    await expect(page).toHaveURL(/\/signup\?as=seller$/);
    await expect(page.getByLabel("Seller name")).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Sign up as a business" }).first().click();
    await expect(page).toHaveURL(/\/signup\?as=business$/);
    await expect(page.getByLabel("Business name")).toBeVisible();
  });

  test("the seller directory search filters", async ({ page }) => {
    await page.goto("/sellers");
    const list = page.getByTestId("seller-list");
    await expect(list.getByRole("heading", { name: "Relay" })).toBeVisible();

    const search = page.getByLabel("Search sellers and services");
    await search.fill("zzzz-no-such-seller");
    await expect(page.getByText("No sellers match “zzzz-no-such-seller”")).toBeVisible();
    await expect(page).toHaveURL(/query=zzzz-no-such-seller/);

    // Service names match too.
    await search.fill("messages");
    await expect(list.getByRole("heading", { name: "Relay" })).toBeVisible();

    await list.getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Relay" })).toBeVisible();
    await expect(page.getByText("Relay messages")).toBeVisible();
  });

  test("the docs list tracks the section in view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/docs");
    await expect(page.locator("h1")).toHaveCount(1);
    await page.locator("#errors").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById("errors")!.scrollIntoView({ block: "start" }));
    await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Error codes" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });
});
