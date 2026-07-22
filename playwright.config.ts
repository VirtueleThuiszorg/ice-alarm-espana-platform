import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const PORT = 8080;
const baseURL = `http://127.0.0.1:${PORT}`;

// In this managed environment Chromium is preinstalled under PLAYWRIGHT_BROWSERS_PATH
// at a build newer than the one @playwright/test@1.49 resolves by default, so point
// at it directly. In CI (where `npx playwright install chromium` runs) the path is
// absent and Playwright resolves the matching browser normally.
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = fs.existsSync(PREINSTALLED_CHROMIUM)
  ? PREINSTALLED_CHROMIUM
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e/.report/results.json" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    // Audit the PRODUCTION build (what users get, per LAUNCH_SCOPE §7 "grep the
    // built output") served by `vite preview`. Bundled assets load in ~1s vs the
    // ~14s/page an unbundled dev server costs on a fresh context per test.
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Anon/placeholder Supabase — the client constructs but data calls fail fast.
      // Provider-dependent assertions are marked as expected-skips, never green.
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb-anon-placeholder-key-for-page-audit",
      VITE_APP_VERSION: "0.0.0-audit",
    },
  },
});
