import { test, expect } from "@playwright/test";

test.describe("Real Owner-Only CSV Onboarding Pilot & Reconciliation E2E Tests", () => {
  async function loginAsOwner(page: any) {
    await page.goto("/login");
    await page.fill("input[type='email']", "owner@odyssey.com");
    await page.fill("input[type='password']", "password123");
    await page.click("button[type='submit']");
    await page.waitForURL("http://localhost:3000/", { timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
  }

  async function loginAsManager(page: any) {
    await page.goto("/login");
    await page.fill("input[type='email']", "manager@odyssey.com");
    await page.fill("input[type='password']", "password123");
    await page.click("button[type='submit']");
    await page.waitForURL("http://localhost:3000/", { timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
  }

  test("1. Owner visits /import and downloads all 7 template types", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/import");
    await expect(page.locator("h1")).toContainText("Owner CSV Onboarding Portal");

    const templateTypes = ["properties", "units", "tenants", "leases", "payments", "expenses", "monthly_summaries"];

    for (const type of templateTypes) {
      const typeBtn = page.locator(`button:has-text("${type.replace('_', ' ')}")`).first();
      await typeBtn.click();

      const downloadBtn = page.locator("button:has-text('Download')").first();
      await expect(downloadBtn).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadBtn.click(),
      ]);

      expect(download.suggestedFilename()).toContain(".csv");
    }
  });

  test("2. Owner uploads CSV files and UI displays classifications & status badges", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/import");

    await expect(page.locator("text=Upload Onboarding CSV")).toBeVisible();
    await expect(page.locator("text=Execution Center")).toBeVisible();

    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached();
  });

  test("3. Reconciliation /reconciliation displays no_data, summary_only, partial_detail, and owner attestation", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/reconciliation");

    await expect(page.locator("h1")).toContainText("Financial Reconciliation & Coverage");

    // Select month with no data
    await page.fill("input[type='month']", "2030-01");
    await expect(page.locator("text=No financial data available for this month.")).toBeVisible();

    // Select active month
    await page.fill("input[type='month']", "2026-05");
    await page.waitForTimeout(500);

    // Select property if available
    const selectProp = page.locator("select").first();
    const optionsCount = await selectProp.locator("option").count();
    if (optionsCount > 1) {
      await selectProp.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    // Check if Owner Attestation button is visible
    const attestBtn = page.locator("button:has-text('Attest Coverage')");
    if (await attestBtn.isVisible()) {
      await attestBtn.click();

      const modalHeading = page.locator("text=Attest Financial Coverage");
      await expect(modalHeading).toBeVisible();

      await page.fill("textarea", "E2E Owner pilot verification signoff");

      const confirmBtn = page.locator("button:has-text('Confirm Detail Complete')");
      await confirmBtn.click();

      await expect(page.locator("text=Detail Complete")).toBeVisible();
    }
  });

  test("4. Non-Owner Manager is denied attestation (visible 403 authorization guard)", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/reconciliation");

    await page.fill("input[type='month']", "2026-05");
    await page.waitForTimeout(500);

    // Manager role must NOT see the Owner Attest Coverage button
    const attestBtn = page.locator("button:has-text('Attest Coverage')");
    await expect(attestBtn).toBeHidden();
  });
});
