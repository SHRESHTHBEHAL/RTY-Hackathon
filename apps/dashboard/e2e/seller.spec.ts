import { expect, test, type Locator, type Page } from "@playwright/test";
import { dollarsToMicros } from "../lib/format";

const SELLER = { email: "team@relay.test", password: "fixture-password" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SELLER.email);
  await page.getByLabel("Password", { exact: true }).fill(SELLER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
}

/** The full amount as plain text: Money keeps it in a screen-reader span. */
async function amountIn(scope: Locator): Promise<bigint> {
  const text = (await scope.locator(".sr-only").first().textContent())!.trim();
  return BigInt(dollarsToMicros(text.replace(/^[+-]/, ""))!);
}

/** Open a charge that has not been refunded yet. */
async function openUnrefundedCharge(page: Page, skip = 0) {
  await page.goto("/seller/charges");
  const row = page.getByRole("row").filter({ hasText: "None" }).nth(skip);
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "Charge" })).toBeVisible();
}

test.describe("task 7: seller screens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create a service, see it listed, deactivate it", async ({ page }) => {
    const name = `Test service ${Date.now()}`;
    await page.goto("/seller/services");
    await expect(page.getByRole("heading", { level: 1, name: "Services" })).toBeVisible();
    await page.getByRole("button", { name: "Create service" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a service" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Service address").fill("https://example.test/api");
    await dialog.getByLabel("Price note").fill("$0.02 per call");
    await dialog.getByRole("button", { name: "Create service" }).click();
    await expect(dialog).toBeHidden();

    const card = page.getByRole("article", { name });
    await expect(card).toBeVisible();
    await expect(card.getByText("Active")).toBeVisible();
    await card.getByRole("button", { name: `Deactivate ${name}` }).click();
    await expect(card.getByText("Disabled")).toBeVisible();
    await expect(card.getByRole("button", { name: `Activate ${name}` })).toBeVisible();
    // It stays deactivated after a reload.
    await page.reload();
    await expect(page.getByRole("article", { name }).getByText("Disabled")).toBeVisible();
  });

  test("the service form explains a bad address in plain words and edits save", async ({ page }) => {
    await page.goto("/seller/services");
    await page.getByRole("button", { name: "Create service" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a service" });
    await dialog.getByRole("button", { name: "Create service" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Enter a name" })).toBeVisible();
    await expect(dialog.getByRole("alert").filter({ hasText: "starting with https://" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: /^Edit Relay messages/ }).click();
    const edit = page.getByRole("dialog", { name: "Edit service" });
    const note = await edit.getByLabel("Price note").inputValue();
    await edit.getByLabel("Price note").fill(note);
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();
  });

  test("the charges table shows fixture charges with formatted amounts", async ({ page }) => {
    await page.goto("/seller/charges");
    const table = page.getByRole("table", { name: "Charges" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Amount" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Fee" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Refunded" })).toBeVisible();
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(10);
    await expect(rows.first().getByText(/^\$\d+\.\d{2,6}$/).first()).toBeVisible();
    await expect(rows.first()).toContainText("$0.01");
    await expect(rows.first()).toContainText("agt_");
  });

  test("overview shows what is owed and paid out, and recent charges", async ({ page }) => {
    const owed = page.getByRole("region", { name: "Amount owed" });
    const paid = page.getByRole("region", { name: "Amount paid out" });
    expect(await amountIn(owed)).toBeGreaterThan(0n);
    expect(await amountIn(paid)).toBeGreaterThan(0n);
    await expect(page.getByRole("list", { name: "Recent charges" }).getByRole("listitem")).toHaveCount(8);
    await expect(page.getByRole("img", { name: /: \d+ charges?$/ }).last()).toBeVisible();
  });

  test("balances refresh on their own, without a reload", async ({ page, context }) => {
    const owed = page.getByRole("region", { name: "Amount owed" });
    const before = await amountIn(owed);
    const other = await context.newPage();
    await openUnrefundedCharge(other, 0);
    // A full one-cent refund: whole cents show up in the two-decimal display.
    await other.getByRole("button", { name: "Review refund" }).click();
    await other.getByRole("dialog").getByRole("button", { name: "Refund $0.01" }).click();
    await expect(other.getByRole("dialog")).toBeHidden();
    await expect.poll(async () => amountIn(owed), { timeout: 10_000 }).toBe(before - 10_000n);
    await other.close();
  });

  test("developers: the seller ID is inside the snippet; a new key is shown once", async ({ page }) => {
    await page.goto("/seller/developers");
    const sellerId = (await page.getByTestId("seller-id").textContent())!.trim();
    expect(sellerId).toMatch(/^sel_[0-9a-z]{24}$/);
    await expect(page.getByTestId("snippet")).toContainText(`sellerId: "${sellerId}"`);
    await expect(page.getByTestId("snippet")).toContainText("gaitwayExpress(seller");

    const label = `Key ${Date.now()}`;
    await page.getByRole("button", { name: "Create key", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create an API key" });
    await dialog.getByRole("button", { name: "Create key" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Give the key a name" })).toBeVisible();
    await dialog.getByLabel("Key name").fill(label);
    await dialog.getByRole("button", { name: "Create key" }).click();
    const secret = page.getByTestId("copy-once-value");
    await expect(secret).toBeVisible();
    const key = (await secret.textContent())!.trim();
    expect(key).toMatch(/^gw_test_sel_[0-9a-z]{32}$/);
    await expect(page.getByText("Shown once.")).toBeVisible();
    await page.getByRole("button", { name: "I have saved it" }).click();

    // The key is gone from the page; only its last four characters remain.
    await expect(page.getByTestId("copy-once-value")).toHaveCount(0);
    expect(await page.content()).not.toContain(key);
    await expect(page.getByRole("row", { name: new RegExp(label) })).toContainText(key.slice(-4));
    await page.reload();
    expect(await page.content()).not.toContain(key);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain(key);
  });

  test("revoking a key asks first, and Escape backs out", async ({ page }) => {
    await page.goto("/seller/developers");
    const label = `Revoke me ${Date.now()}`;
    await page.getByRole("button", { name: "Create key", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Key name").fill(label);
    await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
    await page.getByRole("button", { name: "I have saved it" }).click();

    await page.getByRole("button", { name: `Revoke ${label}` }).click();
    const dialog = page.getByRole("dialog", { name: `Revoke “${label}”?` });
    await expect(dialog).toContainText("cannot be undone");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(label) })).toBeVisible();

    await page.getByRole("button", { name: `Revoke ${label}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByRole("row", { name: new RegExp(label) })).toHaveCount(0);
  });

  test("payouts table lists amount, status and reference; details page names the address", async ({ page }) => {
    await page.goto("/seller/payouts");
    const table = page.getByRole("table", { name: "Payouts" });
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(table.getByRole("columnheader", { name: "Transaction reference" })).toBeVisible();
    await expect(table.getByText("Sent").first()).toBeVisible();
    await expect(table.locator("tbody tr").first()).toContainText("0x");

    await page.getByRole("link", { name: "Payout details" }).click();
    await expect(page).toHaveURL(/\/seller\/payouts\/details$/);
    await expect(page.getByTestId("payout-address")).toHaveText(/^0x[0-9a-fA-F]{40}$/);
    await expect(page.getByText("USDC").first()).toBeVisible();

    // A bad address is explained, a good one asks before it changes anything.
    await page.getByLabel("New payout address").fill("0x123");
    await page.getByRole("button", { name: "Review change" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "0x followed by 40" })).toBeVisible();
  });

  test("crypto words appear only on payout details and in the snippet", async ({ page }) => {
    for (const path of ["/seller", "/seller/services", "/seller/charges", "/seller/payouts", "/seller/subscriptions", "/seller/developers", "/seller/developers/webhooks"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const text = await page.locator("main, body").first().innerText();
      expect(text, path).not.toMatch(/usdc|blockchain|\bgas\b|on-chain|wallet address|payout address/i);
    }
  });
});

test.describe("task 12: full seller product", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("a partial refund updates the refunded amount; the dialog names the exact amount", async ({ page }) => {
    await openUnrefundedCharge(page, 0);
    const refunded = page.getByTestId("row-Refunded so far");
    const left = page.getByTestId("row-Left to refund");
    const before = await amountIn(refunded);
    const leftBefore = await amountIn(left);

    await page.getByRole("radio", { name: "Refund part of it" }).check();
    await page.getByLabel("Amount to refund").fill("0.0035");
    await page.getByRole("button", { name: "Review refund" }).click();

    const dialog = page.getByRole("dialog", { name: "Refund $0.0035?" });
    await expect(dialog).toContainText("$0.0035 goes back to the agent's balance. This cannot be undone.");
    await dialog.getByRole("button", { name: "Refund $0.0035" }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => amountIn(refunded)).toBe(before + 3500n);
    expect(await amountIn(left)).toBe(leftBefore - 3500n);
    await page.reload();
    expect(await amountIn(page.getByTestId("row-Refunded so far"))).toBe(before + 3500n);
  });

  test("a refund beyond the refundable amount is stopped in the form", async ({ page }) => {
    await openUnrefundedCharge(page, 1);
    await page.getByRole("radio", { name: "Refund part of it" }).check();
    await page.getByLabel("Amount to refund").fill("5");
    const error = page.getByRole("alert").filter({ hasText: "You can refund at most" });
    await expect(error).toBeVisible();
    await page.getByRole("button", { name: "Review refund" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Amount to refund")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Amount to refund").fill("0");
    await expect(page.getByRole("alert").filter({ hasText: "above $0.00" })).toBeVisible();
    await page.getByLabel("Amount to refund").fill("abc");
    await expect(page.getByRole("alert").filter({ hasText: "Enter an amount like" })).toBeVisible();
  });

  test("a double-click on the confirm button refunds once", async ({ page }) => {
    await openUnrefundedCharge(page, 2);
    const refunded = page.getByTestId("row-Refunded so far");
    const before = await amountIn(refunded);
    await page.getByRole("radio", { name: "Refund part of it" }).check();
    await page.getByLabel("Amount to refund").fill("0.001");
    await page.getByRole("button", { name: "Review refund" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Refund $0.001" }).dblclick();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect.poll(() => amountIn(refunded)).toBe(before + 1000n);
    await page.waitForTimeout(600);
    expect(await amountIn(refunded)).toBe(before + 1000n);
  });

  test("a full refund closes the form", async ({ page }) => {
    await openUnrefundedCharge(page, 3);
    await page.getByRole("button", { name: "Review refund" }).click();
    const dialog = page.getByRole("dialog", { name: /^Refund \$0\.01\?$/ });
    await expect(dialog).toContainText("cannot be undone");
    await dialog.getByRole("button", { name: "Refund $0.01" }).click();
    await expect(page.getByText("This charge has been refunded in full.")).toBeVisible();
    expect(await amountIn(page.getByTestId("row-Left to refund"))).toBe(0n);
  });

  test("the subscribers page has an invitation when there are none", async ({ page }) => {
    await page.goto("/seller/subscriptions");
    await expect(page.getByRole("heading", { level: 1, name: "Subscriptions" })).toBeVisible();
    await expect(page.getByText("No subscribers yet")).toBeVisible();
  });

  test("webhook: saving shows the secret once", async ({ page }) => {
    await page.goto("/seller/developers/webhooks");
    await page.getByLabel("Address Gaitway should call").fill("nope");
    await page.getByRole("button", { name: "Save webhook" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "starting with https://" })).toBeVisible();
    await page.getByLabel("Address Gaitway should call").fill("https://hooks.example.test/gaitway");
    await page.getByRole("button", { name: "Save webhook" }).click();
    const secret = page.getByTestId("copy-once-value");
    await expect(secret).toHaveText(/^whsec_[0-9a-z]{32}$/);
    const value = (await secret.textContent())!.trim();
    await page.reload();
    await expect(page.getByTestId("copy-once-value")).toHaveCount(0);
    expect(await page.content()).not.toContain(value);
  });

  test("an unknown charge says so", async ({ page }) => {
    await page.goto("/seller/charges/chg_doesnotexist");
    await expect(page.getByText("We cannot find that charge")).toBeVisible();
  });
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("no page scrolls sideways at 375px", async ({ page }) => {
    await login(page);
    await page.goto("/seller/charges");
    const href = await page.getByRole("row").nth(1).getByRole("link").getAttribute("href");
    for (const path of ["/seller", "/seller/services", "/seller/charges", href!, "/seller/payouts", "/seller/payouts/details", "/seller/subscriptions", "/seller/developers", "/seller/developers/webhooks"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${path} overflows by ${over}px`).toBeLessThanOrEqual(0);
    }
  });
});
