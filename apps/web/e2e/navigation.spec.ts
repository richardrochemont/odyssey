import { test, expect, Page } from "@playwright/test";

// Seeded demo users (packages/db/src/seed.ts) covering four of the five roles.
const SEEDED_USERS = {
  owner: { name: "Genevieve Hearth", email: "owner@odyssey.com" },
  manager: { name: "Marcus Lane", email: "manager@odyssey.com" },
  maintenance: { name: "Dave Fixer", email: "maintenance@odyssey.com" },
  read_only: { name: "Investor Bob", email: "readonly@odyssey.com" },
} as const;

async function loginAsSeededRole(page: Page, role: keyof typeof SEEDED_USERS) {
  const { email } = SEEDED_USERS[role];
  await page.goto("/login");
  await page.fill("input[type='email']", email);
  await page.fill("input[type='password']", "password123");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
  await page.waitForLoadState("domcontentloaded");
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * No "accountant" fixture exists in the seed data. Accountant nav visibility
 * is pure client-side role filtering in Header.tsx (auth-context.tsx decodes
 * the JWT locally without verifying its signature to populate `user`), so this
 * authenticates with a locally-crafted, unsigned token and stubs /workspaces.
 * It never touches the database and only asserts on header rendering.
 */
async function loginAsSyntheticAccountant(page: Page) {
  await page.route("**/workspaces", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  const token = [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({
      id: "synthetic-accountant-e2e",
      name: "Ada Ledger",
      email: "accountant-e2e@example.test",
      role: "accountant",
      orgId: "synthetic-org-e2e",
      activeOrgId: "synthetic-org-e2e",
      tokenVersion: 1,
    }),
    "test-signature",
  ].join(".");
  await page.addInitScript((t) => window.localStorage.setItem("hearthlane_token", t), token);
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}

test.describe("Odyssey Navigation and App Shell E2E Tests", () => {
  test("should display active top-navigation state and navigate between routes", async ({ page }) => {
    await loginAsSeededRole(page, "owner");

    const portfolioLink = page.locator('[data-testid="nav-link-portfolio"]');
    await expect(portfolioLink).toBeVisible();
    await expect(portfolioLink).toHaveAttribute("data-active", "true");

    await page.locator('[data-testid="nav-link-tenants"]').click();
    await page.waitForURL("**/leases");
    await expect(page.locator('[data-testid="nav-link-tenants"]')).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "false");
  });

  test("should open search palette via Cmd/Ctrl+K and click trigger", async ({ page }) => {
    await loginAsSeededRole(page, "owner");

    const searchBtn = page.locator('[data-testid="search-palette-btn"]');
    await expect(searchBtn).toBeVisible();

    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");

    const searchPalette = page.locator('[data-testid="search-palette"]');
    await expect(searchPalette).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(searchPalette).toBeHidden();

    await searchBtn.click();
    await expect(searchPalette).toBeVisible();
  });

  test("should search and support keyboard result navigation and Enter-to-open", async ({ page }) => {
    await loginAsSeededRole(page, "owner");

    await page.locator('[data-testid="search-palette-btn"]').click();
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.focus();
    await searchInput.fill("Oakridge");

    const resultsContainer = page.locator('[data-testid="search-results-container"]');
    await expect(resultsContainer).toBeVisible();

    const propertyItem = page.locator('[data-testid="search-item-Property"]').first();
    await expect(propertyItem).toBeVisible();
    await expect(propertyItem).toHaveAttribute("data-highlighted", "true");

    await page.keyboard.press("ArrowDown");
    await expect(propertyItem).toHaveAttribute("data-highlighted", "false");

    const highlightedItem = page.locator('[data-highlighted="true"]');
    await expect(highlightedItem).toBeVisible();
    await page.keyboard.press("Enter");

    await page.waitForURL((url) => url.pathname.startsWith("/properties/") || url.pathname.startsWith("/leases/"));
  });

  test("should show Add menu based on user role authorizations and sign out correctly", async ({ page }) => {
    await loginAsSeededRole(page, "owner");
    await expect(page.locator('[data-testid="add-btn"]')).toBeVisible();

    await page.locator('[data-testid="add-btn"]').click();
    await expect(page.locator('text="Add expense"')).toBeVisible();
    await expect(page.locator('text="Add property"')).toBeVisible();

    await page.locator('[data-testid="profile-btn"]').click();
    const signOutBtn = page.getByRole("menuitem", { name: "Sign Out" });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();
    await page.waitForURL((url) => url.pathname === "/login");

    await loginAsSeededRole(page, "read_only");
    await expect(page.locator('[data-testid="add-btn"]')).toBeHidden();
  });

  test("Ask Odyssey control remains intact", async ({ page }) => {
    await loginAsSeededRole(page, "owner");
    const askOdyssey = page.locator('[data-testid="ask-odyssey-btn"]');
    await expect(askOdyssey).toBeVisible();
    await askOdyssey.click();
    // Toggling dispatches a custom event consumed by AssistantPanel elsewhere in the tree;
    // this only confirms the control itself is unaffected by the nav change.
  });

  test("profile/workspace menu remains intact", async ({ page }) => {
    await loginAsSeededRole(page, "owner");
    await page.locator('[data-testid="profile-btn"]').click();
    await expect(page.locator('[data-testid="workspace-switcher"]')).toBeVisible();
    await expect(page.locator('[data-testid="team-members-link"]')).toBeVisible();
  });

  test("should handle responsive menu behaviors for mobile screen sizes", async ({ page }) => {
    await loginAsSeededRole(page, "owner");
    await page.setViewportSize({ width: 375, height: 667 });

    await expect(page.locator('[data-testid="nav-link-portfolio"]')).toBeHidden();
    const mobileMenuBtn = page.locator('[data-testid="mobile-menu-btn"]');
    await expect(mobileMenuBtn).toBeVisible();

    await mobileMenuBtn.click();
    const drawer = page.locator('[data-testid="mobile-drawer"]');
    await expect(drawer).toBeVisible();

    const mobileTenantsLink = page.locator('[data-testid="mobile-nav-link-tenants"]');
    await expect(mobileTenantsLink).toBeVisible();
    await mobileTenantsLink.click();

    await page.waitForURL("**/leases");
    await expect(drawer).toBeHidden();
  });

  test.describe("Four-pillar primary nav taxonomy", () => {
    test("desktop nav renders exactly Portfolio | Tenants | Money | Tasks for an owner", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-tenants"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-money"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-tasks"]')).toBeVisible();
    });

    test("Documents is absent from the primary header nav", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      await expect(page.locator('[data-testid="nav-link-documents"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="mobile-nav-link-documents"]')).toHaveCount(0);
      // The page itself must still exist and be reachable by direct/deep link.
      const response = await page.request.get("/documents");
      expect(response.status()).toBe(200);
    });

    test("Leasing and Growth are absent from desktop and mobile navigation", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      for (const name of ["leasing", "growth"]) {
        await expect(page.locator(`[data-testid="nav-link-${name}"]`)).toHaveCount(0);
        await expect(page.locator(`[data-testid="mobile-nav-link-${name}"]`)).toHaveCount(0);
      }
      const primaryNav = page.locator('nav[aria-label="Primary"]').first();
      await expect(primaryNav.getByText("Leasing", { exact: true })).toHaveCount(0);
      await expect(primaryNav.getByText("Growth", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("Role-based pillar visibility", () => {
    test("owner sees all four pillars", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      for (const id of ["portfolio", "tenants", "money", "tasks"]) {
        await expect(page.locator(`[data-testid="nav-link-${id}"]`)).toBeVisible();
      }
    });

    test("manager sees all four pillars", async ({ page }) => {
      await loginAsSeededRole(page, "manager");
      for (const id of ["portfolio", "tenants", "money", "tasks"]) {
        await expect(page.locator(`[data-testid="nav-link-${id}"]`)).toBeVisible();
      }
    });

    test("read-only sees all four pillars", async ({ page }) => {
      await loginAsSeededRole(page, "read_only");
      for (const id of ["portfolio", "tenants", "money", "tasks"]) {
        await expect(page.locator(`[data-testid="nav-link-${id}"]`)).toBeVisible();
      }
    });

    test("maintenance sees Portfolio, Tenants, and Tasks, but not Money", async ({ page }) => {
      await loginAsSeededRole(page, "maintenance");
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-tenants"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-tasks"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-money"]')).toHaveCount(0);
    });

    test("accountant sees only Tasks and never an empty primary nav", async ({ page }) => {
      await loginAsSyntheticAccountant(page);
      await expect(page.locator('[data-testid="nav-link-tasks"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="nav-link-tenants"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="nav-link-money"]')).toHaveCount(0);

      const primaryNav = page.locator('nav[aria-label="Primary"]').first();
      await expect(primaryNav.locator("a, button")).toHaveCount(1);
    });
  });

  test.describe("Money desktop flyout", () => {
    test("opens via mouse click, Enter, and Space; closes via Escape with focus restored", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      const trigger = page.locator('[data-testid="nav-link-money"]');
      const menu = page.locator('[data-testid="money-nav-menu"]');

      // Mouse click
      await trigger.click();
      await expect(menu).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");

      // Escape closes and restores focus to the trigger
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();

      // Enter opens (trigger already focused from the Escape restore above)
      await page.keyboard.press("Enter");
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();

      // Space opens
      await trigger.focus();
      await page.keyboard.press(" ");
      await expect(menu).toBeVisible();
    });

    test("closes on outside click", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      const trigger = page.locator('[data-testid="nav-link-money"]');
      const menu = page.locator('[data-testid="money-nav-menu"]');

      await trigger.click();
      await expect(menu).toBeVisible();

      await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
      await expect(menu).toBeHidden();
    });

    test("has correct accessible semantics and reachable menu items", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      const trigger = page.locator('[data-testid="nav-link-money"]');
      await expect(trigger).toHaveAttribute("aria-haspopup", "true");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toHaveAttribute("aria-controls", "money-nav-menu");

      await trigger.click();
      const menu = page.locator('[data-testid="money-nav-menu"]');
      await expect(menu).toHaveAttribute("role", "menu");
      for (const child of ["Cash Flow", "Expenses", "Financials", "Reconciliation"]) {
        await expect(menu.getByRole("menuitem", { name: child })).toBeVisible();
      }
    });

    test("Money becomes active for /cashflow, /expenses, /financials, and /reconciliation", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      for (const path of ["/cashflow", "/expenses", "/financials", "/reconciliation"]) {
        await page.goto(path);
        await expect(page.locator('[data-testid="nav-link-money"]')).toHaveAttribute("data-active", "true");
        await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "false");
      }
    });
  });

  test.describe("Active-state route matching", () => {
    test("Portfolio, Tenants, and Tasks activate correctly and '/' does not match every route", async ({ page }) => {
      await loginAsSeededRole(page, "owner");

      await page.goto("/");
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "true");

      await page.goto("/properties");
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "true");

      await page.goto("/leases");
      await expect(page.locator('[data-testid="nav-link-tenants"]')).toHaveAttribute("data-active", "true");
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "false");

      await page.goto("/tasks");
      await expect(page.locator('[data-testid="nav-link-tasks"]')).toHaveAttribute("data-active", "true");
      await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "false");
      await expect(page.locator('[data-testid="nav-link-tenants"]')).toHaveAttribute("data-active", "false");
    });
  });

  test.describe("Mobile Money disclosure", () => {
    test("expands to reveal its four child routes and closes the drawer on leaf-link selection", async ({ page }) => {
      await loginAsSeededRole(page, "owner");
      await page.setViewportSize({ width: 375, height: 667 });

      await page.locator('[data-testid="mobile-menu-btn"]').click();
      const drawer = page.locator('[data-testid="mobile-drawer"]');
      await expect(drawer).toBeVisible();

      const moneyDisclosure = page.locator('[data-testid="mobile-nav-link-money"]');
      await expect(moneyDisclosure).toBeVisible();
      await expect(moneyDisclosure).toHaveAttribute("aria-expanded", "false");

      await moneyDisclosure.click();
      await expect(moneyDisclosure).toHaveAttribute("aria-expanded", "true");

      const cashFlowLeaf = page.locator('[data-testid="mobile-nav-link-money-cash-flow"]');
      await expect(cashFlowLeaf).toBeVisible();

      const box = await cashFlowLeaf.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);

      await cashFlowLeaf.click();
      await page.waitForURL("**/cashflow");
      await expect(drawer).toBeHidden();
    });
  });

  test.describe("Existing deep links remain reachable", () => {
    for (const path of [
      "/financials",
      "/reconciliation",
      "/tasks",
      "/maintenance",
      "/import",
      "/settings",
      "/settings/team",
      "/documents",
      "/properties",
      "/leases",
      "/cashflow",
      "/expenses",
    ]) {
      test(`${path} still renders (not a dead route)`, async ({ page }) => {
        await loginAsSeededRole(page, "owner");
        const response = await page.goto(path);
        expect(response?.status()).toBeLessThan(400);
      });
    }
  });
});
