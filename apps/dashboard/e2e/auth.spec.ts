import { expect, test, type Page } from "@playwright/test";

const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const PASSWORD = "e2e-password-123";

async function signUp(page: Page, kind: "business" | "seller", email: string, name: string) {
  await page.goto("/signup");
  if (kind === "seller") await page.getByRole("radio", { name: /Seller/ }).click();
  await page.getByLabel(kind === "business" ? "Business name" : "Seller name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: kind === "business" ? "Create business account" : "Create seller account" }).click();
  const key = page.getByTestId("copy-once-value");
  await expect(key).toBeVisible();
  return (await key.textContent())!.trim();
}

test("signing up as a business shows the key once and lands on /business", async ({ page }) => {
  const key = await signUp(page, "business", uniqueEmail("biz"), "E2E Business");
  expect(key).toMatch(/^gw_test_biz_[0-9a-z]{32}$/);
  await expect(page.getByText("Shown once.")).toBeVisible();
  await page.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
});

test("signing up as a seller lands on /seller", async ({ page }) => {
  const key = await signUp(page, "seller", uniqueEmail("sel"), "E2E Seller");
  expect(key).toMatch(/^gw_test_sel_[0-9a-z]{32}$/);
  await page.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
});

test("the API key shown at sign-up is gone after a reload", async ({ page }) => {
  const key = await signUp(page, "business", uniqueEmail("once"), "E2E Once");
  await page.reload();
  await expect(page.getByTestId("copy-once-value")).toHaveCount(0);
  expect(await page.content()).not.toContain(key);
  // Nothing was written to browser storage either.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain(key);
  expect(stored).not.toContain("gws_");
});

test("log out, then log in again", async ({ page }) => {
  const email = uniqueEmail("relog");
  await signUp(page, "business", email, "E2E Relog");
  await page.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect(page).toHaveURL(/\/business$/);

  await page.getByRole("button", { name: /E2E Relog/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/business");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByText("E2E Relog").first()).toBeVisible();
});

test("a wrong password shows an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("ops@acme.test");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  const error = page.getByRole("alert").filter({ hasText: "Email or password is wrong" });
  await expect(error).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
});

test("visiting /business or /seller logged out redirects to log-in", async ({ page }) => {
  await page.goto("/business");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/seller");
  await expect(page).toHaveURL(/\/login$/);
});

test("the session cookie is httpOnly", async ({ page, context }) => {
  await signUp(page, "seller", uniqueEmail("cookie"), "E2E Cookie");
  const cookie = (await context.cookies()).find((c) => c.name === "gw_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.value.startsWith("gws_")).toBe(true);
  expect(page.url()).not.toContain("gws_");
});
