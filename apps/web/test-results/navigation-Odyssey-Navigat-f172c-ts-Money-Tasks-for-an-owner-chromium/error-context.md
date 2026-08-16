# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Odyssey Navigation and App Shell E2E Tests >> Four-pillar primary nav taxonomy >> desktop nav renders exactly Portfolio | Tenants | Money | Tasks for an owner
- Location: e2e/navigation.spec.ts:168:9

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: page.fill: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('input[type=\'email\']')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]: missing required error components, refreshing...
```

# Test source

```ts
  1   | import { test, expect, Page } from "@playwright/test";
  2   | 
  3   | // Seeded demo users (packages/db/src/seed.ts) covering four of the five roles.
  4   | const SEEDED_USERS = {
  5   |   owner: { name: "Genevieve Hearth", email: "owner@odyssey.com" },
  6   |   manager: { name: "Marcus Lane", email: "manager@odyssey.com" },
  7   |   maintenance: { name: "Dave Fixer", email: "maintenance@odyssey.com" },
  8   |   read_only: { name: "Investor Bob", email: "readonly@odyssey.com" },
  9   | } as const;
  10  | 
  11  | async function loginAsSeededRole(page: Page, role: keyof typeof SEEDED_USERS) {
  12  |   const { email } = SEEDED_USERS[role];
  13  |   await page.goto("/login");
> 14  |   await page.fill("input[type='email']", email);
      |              ^ Error: page.fill: Test timeout of 90000ms exceeded.
  15  |   await page.fill("input[type='password']", "password123");
  16  |   await page.click("button[type='submit']");
  17  |   await page.waitForURL("**/");
  18  |   await page.waitForLoadState("domcontentloaded");
  19  | }
  20  | 
  21  | function base64Url(value: object): string {
  22  |   return Buffer.from(JSON.stringify(value)).toString("base64url");
  23  | }
  24  | 
  25  | /**
  26  |  * No "accountant" fixture exists in the seed data. Accountant nav visibility
  27  |  * is pure client-side role filtering in Header.tsx (auth-context.tsx decodes
  28  |  * the JWT locally without verifying its signature to populate `user`), so this
  29  |  * authenticates with a locally-crafted, unsigned token and stubs /workspaces.
  30  |  * It never touches the database and only asserts on header rendering.
  31  |  */
  32  | async function loginAsSyntheticAccountant(page: Page) {
  33  |   await page.route("**/workspaces", (route) =>
  34  |     route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  35  |   );
  36  |   const token = [
  37  |     base64Url({ alg: "none", typ: "JWT" }),
  38  |     base64Url({
  39  |       id: "synthetic-accountant-e2e",
  40  |       name: "Ada Ledger",
  41  |       email: "accountant-e2e@example.test",
  42  |       role: "accountant",
  43  |       orgId: "synthetic-org-e2e",
  44  |       activeOrgId: "synthetic-org-e2e",
  45  |       tokenVersion: 1,
  46  |     }),
  47  |     "test-signature",
  48  |   ].join(".");
  49  |   await page.addInitScript((t) => window.localStorage.setItem("hearthlane_token", t), token);
  50  |   await page.goto("/");
  51  |   await page.waitForLoadState("domcontentloaded");
  52  | }
  53  | 
  54  | test.describe("Odyssey Navigation and App Shell E2E Tests", () => {
  55  |   test("should display active top-navigation state and navigate between routes", async ({ page }) => {
  56  |     await loginAsSeededRole(page, "owner");
  57  | 
  58  |     const portfolioLink = page.locator('[data-testid="nav-link-portfolio"]');
  59  |     await expect(portfolioLink).toBeVisible();
  60  |     await expect(portfolioLink).toHaveAttribute("data-active", "true");
  61  | 
  62  |     await page.locator('[data-testid="nav-link-tenants"]').click();
  63  |     await page.waitForURL("**/leases");
  64  |     await expect(page.locator('[data-testid="nav-link-tenants"]')).toHaveAttribute("data-active", "true");
  65  |     await expect(page.locator('[data-testid="nav-link-portfolio"]')).toHaveAttribute("data-active", "false");
  66  |   });
  67  | 
  68  |   test("should open search palette via Cmd/Ctrl+K and click trigger", async ({ page }) => {
  69  |     await loginAsSeededRole(page, "owner");
  70  | 
  71  |     const searchBtn = page.locator('[data-testid="search-palette-btn"]');
  72  |     await expect(searchBtn).toBeVisible();
  73  | 
  74  |     await page.keyboard.down("Control");
  75  |     await page.keyboard.press("k");
  76  |     await page.keyboard.up("Control");
  77  | 
  78  |     const searchPalette = page.locator('[data-testid="search-palette"]');
  79  |     await expect(searchPalette).toBeVisible();
  80  | 
  81  |     await page.keyboard.press("Escape");
  82  |     await expect(searchPalette).toBeHidden();
  83  | 
  84  |     await searchBtn.click();
  85  |     await expect(searchPalette).toBeVisible();
  86  |   });
  87  | 
  88  |   test("should search and support keyboard result navigation and Enter-to-open", async ({ page }) => {
  89  |     await loginAsSeededRole(page, "owner");
  90  | 
  91  |     await page.locator('[data-testid="search-palette-btn"]').click();
  92  |     const searchInput = page.locator('[data-testid="search-input"]');
  93  |     await searchInput.focus();
  94  |     await searchInput.fill("Oakridge");
  95  | 
  96  |     const resultsContainer = page.locator('[data-testid="search-results-container"]');
  97  |     await expect(resultsContainer).toBeVisible();
  98  | 
  99  |     const propertyItem = page.locator('[data-testid="search-item-Property"]').first();
  100 |     await expect(propertyItem).toBeVisible();
  101 |     await expect(propertyItem).toHaveAttribute("data-highlighted", "true");
  102 | 
  103 |     await page.keyboard.press("ArrowDown");
  104 |     await expect(propertyItem).toHaveAttribute("data-highlighted", "false");
  105 | 
  106 |     const highlightedItem = page.locator('[data-highlighted="true"]');
  107 |     await expect(highlightedItem).toBeVisible();
  108 |     await page.keyboard.press("Enter");
  109 | 
  110 |     await page.waitForURL((url) => url.pathname.startsWith("/properties/") || url.pathname.startsWith("/leases/"));
  111 |   });
  112 | 
  113 |   test("should show Add menu based on user role authorizations and sign out correctly", async ({ page }) => {
  114 |     await loginAsSeededRole(page, "owner");
```