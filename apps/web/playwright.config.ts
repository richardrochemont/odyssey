import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // reuseExistingServer is always false: a manually started dev server on
  // 3000/4000 (e.g. from local browser-preview work) would otherwise be
  // silently reused, so its process never receives the NODE_ENV/E2E_TEST_MODE
  // env below and the E2E run ends up sharing rate-limit budget with
  // whatever else is talking to that server. With this false, Playwright
  // always spawns its own process and fails fast with a clear message
  // ("<url> is already used, make sure that nothing is running on the
  // port/url...") if the port is already occupied, instead of reusing it.
  // CI already ran with reuseExistingServer: false before this change
  // (!process.env.CI was false in CI), so CI behavior is unaffected.
  webServer: [
    {
      command: "pnpm --filter @odyssey/api run dev",
      url: "http://localhost:4000/health",
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        DATABASE_URL: "postgres://postgres:password@localhost:5432/odyssey",
        PORT: "4000",
        NODE_ENV: "test",
        E2E_TEST_MODE: "true",
      },
    },
    {
      command: "pnpm --filter @odyssey/web run dev",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:4000",
      },
    },
  ],
});
