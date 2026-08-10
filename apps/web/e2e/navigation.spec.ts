import { test, expect } from "@playwright/test";

test.describe("Odyssey Navigation and App Shell E2E Tests", () => {
  // Helper function to log in as a specific user role
  async function loginAs(page: any, name: string) {
    await page.goto("/login");
    await page.waitForSelector(`text=${name}`);
    await page.click(`text=${name}`);
    await page.waitForURL("**/");
  }

  test("should display active top-navigation state and navigate between routes", async ({ page }) => {
    await loginAs(page, "Genevieve Hearth"); // Login as Owner

    // Verify header is visible and desktop navigation links are present
    const portfolioLink = page.locator('[data-testid="nav-link-portfolio"]');
    await expect(portfolioLink).toBeVisible();
    await expect(portfolioLink).toHaveAttribute("data-active", "true");

    // Click on Properties link
    const propertiesLink = page.locator('[data-testid="nav-link-properties"]');
    await expect(propertiesLink).toBeVisible();
    await propertiesLink.click();

    // Verify navigation and active tab update
    await page.waitForURL("**/properties");
    await expect(page.locator('[data-testid="nav-link-properties"]')).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "false");
  });

  test("should open search palette via Cmd/Ctrl+K and click trigger", async ({ page }) => {
    await loginAs(page, "Genevieve Hearth");

    // Verify search button in header exists
    const searchBtn = page.locator('[data-testid="search-palette-btn"]');
    await expect(searchBtn).toBeVisible();

    // Press keyboard shortcut to open search palette (Meta+K / Ctrl+K)
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");

    const searchPalette = page.locator('[data-testid="search-palette"]');
    await expect(searchPalette).toBeVisible();

    // Press Escape to close it
    await page.keyboard.press("Escape");
    await expect(searchPalette).toBeHidden();

    // Click the search button in the header
    await searchBtn.click();
    await expect(searchPalette).toBeVisible();
  });

  test("should search and support keyboard result navigation and Enter-to-open", async ({ page }) => {
    await loginAs(page, "Genevieve Hearth");

    // Open Search Palette
    await page.locator('[data-testid="search-palette-btn"]').click();
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.focus();

    // Type query matching Oakridge Manor
    await searchInput.fill("Oakridge");

    // Wait for results
    const resultsContainer = page.locator('[data-testid="search-results-container"]');
    await expect(resultsContainer).toBeVisible();

    // Verify a matching property is found
    const propertyItem = page.locator('[data-testid="search-item-Property"]').first();
    await expect(propertyItem).toBeVisible();

    // Verify first item is highlighted by default
    await expect(propertyItem).toHaveAttribute("data-highlighted", "true");

    // Verify keyboard navigation: ArrowDown moves highlight to next item
    await page.keyboard.press("ArrowDown");
    await expect(propertyItem).toHaveAttribute("data-highlighted", "false");

    // Press Enter to open the now-highlighted item
    const highlightedItem = page.locator('[data-highlighted="true"]');
    await expect(highlightedItem).toBeVisible();
    await page.keyboard.press("Enter");
    
    // Assert that we navigate to one of the detail page routes
    await page.waitForURL((url) => {
      return url.pathname.startsWith("/properties/") || url.pathname.startsWith("/leases/");
    });
  });

  test("should show Add menu based on user role authorizations", async ({ page }) => {
    // 1. Log in as Genevieve Hearth (Owner) -> Add menu should be visible
    await loginAs(page, "Genevieve Hearth");
    await expect(page.locator('[data-testid="add-btn"]')).toBeVisible();

    // Open add menu dropdown and verify choices
    await page.locator('[data-testid="add-btn"]').click();
    await expect(page.locator('text="Add expense"')).toBeVisible();
    await expect(page.locator('text="Add property"')).toBeVisible();

    // Log out by clicking profile then Sign Out (specific to the desktop menu)
    await page.locator('[data-testid="profile-btn"]').click();
    const signOutBtn = page.getByRole("menuitem", { name: "Sign Out" });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();
    await page.waitForURL((url) => url.pathname === "/login");

    // 2. Log in as Investor Bob (Read Only) -> Add menu should NOT be visible
    await loginAs(page, "Investor Bob");
    await expect(page.locator('[data-testid="add-btn"]')).toBeHidden();
  });

  test("should handle responsive menu behaviors for mobile screen sizes", async ({ page }) => {
    await loginAs(page, "Genevieve Hearth");

    // Resize viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });

    // Desktop nav should be hidden, mobile hamburger trigger should be visible
    await expect(page.locator('[data-testid="nav-link-portfolio"]')).toBeHidden();
    const mobileMenuBtn = page.locator('[data-testid="mobile-menu-btn"]');
    await expect(mobileMenuBtn).toBeVisible();

    // Open drawer
    await mobileMenuBtn.click();
    const drawer = page.locator('[data-testid="mobile-drawer"]');
    await expect(drawer).toBeVisible();

    // Click links inside mobile drawer
    const mobilePropertiesLink = page.locator('[data-testid="mobile-nav-link-properties"]');
    await expect(mobilePropertiesLink).toBeVisible();
    await mobilePropertiesLink.click();

    // Drawer should auto-close and navigate
    await page.waitForURL("**/properties");
    await expect(drawer).toBeHidden();
  });
});
