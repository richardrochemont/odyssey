import { expect, test, type Page } from "@playwright/test";

async function authenticateAsOwner(page: Page) {
  const payload = Buffer.from(
    JSON.stringify({
      id: "owner-1",
      name: "Test Owner",
      role: "owner",
      orgId: "org-1",
      activeOrgId: "org-1",
      tokenVersion: 1,
    }),
  ).toString("base64url");

  await page.addInitScript(
    (token) => localStorage.setItem("hearthlane_token", token),
    `x.${payload}.x`,
  );
}

async function mockApi(page: Page, responses: Record<string, unknown> = {}) {
  await page.route("http://localhost:4000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[path] ?? []),
    });
  });
}

test.describe("CSV owner onboarding entry points", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsOwner(page);
  });

  test("dashboard card appears for a new owner organization", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Get started with your rental data" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Import data", exact: true }),
    ).toHaveAttribute("href", "/import");
    await expect(
      page.getByRole("link", { name: "Download templates" }),
    ).toHaveAttribute("href", "/import");
  });

  test("dashboard card is hidden after a successful import", async ({ page }) => {
    await mockApi(page, {
      "/imports/runs": [{ id: "run-1", status: "completed" }],
    });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Portfolio Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Get started with your rental data" })).toBeHidden();
  });

  test("page-specific empty states do not repeat import CTA cards", async ({ page }) => {
    await mockApi(page, {
      "/financials/summary": {
        status: "no_data",
        scheduledRent: null,
        recordedRent: null,
        totalIncome: null,
        totalExpenses: null,
        netOperatingIncome: null,
        notes: "No source data",
      },
    });

    for (const route of ["/properties", "/financials", "/cashflow"]) {
      await page.goto(route);
      await expect(page.getByRole("link", { name: /Import (properties|historical)/i })).toHaveCount(0);
    }
  });

  test("reconciliation no_data renders a subtle import link", async ({ page }) => {
    await mockApi(page, {
      "/financials/summary": {
        status: "no_data",
        scheduledRent: null,
        recordedRent: null,
        outstandingRent: null,
        totalIncome: null,
        totalExpenses: null,
        netOperatingIncome: null,
        notes: "No source data",
      },
    });
    await page.goto("/reconciliation");

    const importLink = page.getByRole("link", { name: "Import data to reconcile this month" });
    await expect(importLink).toBeVisible();
    await expect(importLink).toHaveAttribute("href", "/import");
  });

  test("settings provides permanent import and export links", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Data import & exports" })).toBeVisible();
    for (const name of ["Import CSV data", "Download CSV templates", "View import history"]) {
      await expect(page.getByRole("link", { name })).toHaveAttribute("href", "/import");
    }
  });

  test("monthly summaries query preselects Monthly Summaries", async ({
    page,
  }) => {
    await mockApi(page, {
      "/imports/sources/default": { id: "source-1" },
      "/imports/runs": [],
    });
    await page.goto("/import?type=monthly_summaries");

    await expect(
      page.getByRole("button", { name: "Monthly Summaries" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Download monthly_summaries Template" }),
    ).toBeVisible();
  });

  test("invalid type query defaults safely to Properties", async ({ page }) => {
    await mockApi(page, {
      "/imports/sources/default": { id: "source-1" },
      "/imports/runs": [],
    });
    await page.goto("/import?type=not-a-real-import");

    await expect(
      page.getByRole("button", { name: "Properties", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Download properties Template" }),
    ).toBeVisible();
  });

  test("existing import type selection still changes the active template", async ({
    page,
  }) => {
    await mockApi(page, {
      "/imports/sources/default": { id: "source-1" },
      "/imports/runs": [],
    });
    await page.goto("/import");

    await page.getByRole("button", { name: "Expenses", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Expenses", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Download expenses Template" }),
    ).toBeVisible();
  });
});
