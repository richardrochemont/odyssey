import { test, expect } from "@playwright/test";

test.describe("Task Center static accessibility contract", () => {
  test("unauthenticated task route does not expose mutation controls", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.getByRole("button", { name: "Create task" })).toHaveCount(0);
  });

  test("task route renders successfully before client-side auth redirect", async ({ request }) => {
    const response = await request.get("/tasks");
    expect([200, 307, 308]).toContain(response.status());
  });

  test("owner creates a manual calendar-date task with accessible controls", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("name@company.com").fill("owner@odyssey.com");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/");
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Task Center" })).toBeVisible();
    await page.getByRole("button", { name: "Create task" }).click();
    const dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Title").fill("Playwright manual task");
    await dialog.getByLabel("Due date").fill("2026-12-31");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Playwright manual task", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Dec 31, 2026/).first()).toBeVisible();
  });
});
