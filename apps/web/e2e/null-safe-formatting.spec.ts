import { expect, test } from "@playwright/test";
import { formatCents } from "../src/lib/format";

test.describe("null-safe financial formatting", () => {
  test("formats cents without converting missing data to zero", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(185000)).toBe("$1,850.00");
  });
});

type ReconciliationStatus = "no_data" | "partial_detail" | "detail_complete";

const summaries: Record<ReconciliationStatus, Record<string, unknown>> = {
  no_data: {
    status: "no_data",
    scheduledRent: null,
    recordedRent: null,
    outstandingRent: null,
    totalIncome: null,
    totalExpenses: null,
    netOperatingIncome: null,
    notes: "No source data",
  },
  partial_detail: {
    status: "partial_detail",
    scheduledRent: 1850,
    recordedRent: null,
    outstandingRent: null,
    totalIncome: 1850,
    totalExpenses: 0,
    netOperatingIncome: 1850,
    notes: "Summary baseline retained",
  },
  detail_complete: {
    status: "detail_complete",
    scheduledRent: 1850,
    recordedRent: 1850,
    outstandingRent: 0,
    totalIncome: 1850,
    totalExpenses: 250,
    netOperatingIncome: 1600,
    notes: "Transaction detail complete",
  },
};

async function openReconciliation(page: import("@playwright/test").Page, status: ReconciliationStatus) {
  const payload = Buffer.from(JSON.stringify({
    id: "owner-1",
    name: "Test Owner",
    role: "owner",
    orgId: "org-1",
    activeOrgId: "org-1",
    tokenVersion: 1,
  })).toString("base64url");

  await page.addInitScript((token) => localStorage.setItem("hearthlane_token", token), `x.${payload}.x`);
  await page.route("http://localhost:4000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/properties"
      ? [{ id: "property-1", nickname: "Oakridge", externalKey: "OAK-1" }]
      : path === "/financials/summary"
        ? summaries[status]
        : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/reconciliation");
  await expect(page.getByRole("heading", { name: "Financial Reconciliation & Coverage" })).toBeVisible();
}

test.describe("reconciliation nullable metrics", () => {
  test("no_data renders its empty-state message without a client exception", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await openReconciliation(page, "no_data");
    await expect(page.getByText("No financial data available for this month.")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  for (const status of ["partial_detail", "detail_complete"] as const) {
    test(`${status} metrics render correctly`, async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on("pageerror", (error) => pageErrors.push(error));

      await openReconciliation(page, status);
      await expect(page.getByText("$1,850.00").first()).toBeVisible();
      if (status === "partial_detail") {
        await expect(page.getByText("—", { exact: true })).toBeVisible();
        await expect(page.getByText("$0.00", { exact: true })).toBeVisible();
      } else {
        await expect(page.getByText("$250.00", { exact: true })).toBeVisible();
        await expect(page.getByText("$1,600.00", { exact: true })).toBeVisible();
      }
      expect(pageErrors).toEqual([]);
    });
  }
});

test("login and dashboard render nullable metrics without a client exception", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Odyssey" })).toBeVisible();

  const payload = Buffer.from(JSON.stringify({
    id: "owner-1",
    name: "Test Owner",
    role: "owner",
    orgId: "org-1",
    activeOrgId: "org-1",
    tokenVersion: 1,
  })).toString("base64url");
  await page.addInitScript((token) => localStorage.setItem("hearthlane_token", token), `x.${payload}.x`);

  const currentDate = new Date().toISOString();
  await page.route("http://localhost:4000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/workspaces": [],
      "/properties": [{ id: "property-1", nickname: "Oakridge", propertyType: "single_family", estimatedValue: null, units: [] }],
      "/leases": [{ id: "lease-1", status: "active", monthlyRent: null, daysUntilExpiry: 365, unitNumber: "1", tenantName: "Tenant", propertyNickname: "Oakridge" }],
      "/payments": [{ id: "payment-1", status: "paid", amountDue: null, amountReceived: null, dueDate: currentDate }],
      "/financials/records": [{ id: "expense-1", amount: null, date: currentDate, category: "repairs_and_maintenance", propertyNickname: "Oakridge" }],
      "/financials/trends": [{ month: "Aug", collected: null, projected: null, expenses: null }],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[path] ?? []),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Portfolio Overview" })).toBeVisible();
  await expect(page.getByText("—", { exact: true }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
