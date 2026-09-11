import { defineConfig } from "@playwright/test";
import fs from "node:fs";

/**
 * The performance measurement run, kept OUT of `playwright.config.ts` on purpose.
 *
 * `npm run audit:pages` is a gate that has to stay quick enough to run on a whim.
 * A full scorecard pass throttles the CPU 4x and the network to Slow 4G across ~36
 * routes and takes minutes — folding it into the page audit would make people stop
 * running the page audit.
 *
 * Same production build, same preview server, same Chromium. Only the test
 * directory and the patience differ.
 */

const PORT = 8081;
const baseURL = `http://127.0.0.1:${PORT}`;

const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = fs.existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

export default defineConfig({
  testDir: "./e2e/perf",
  // One route at a time, one worker. Two throttled contexts on one CPU measure each
  // other's contention rather than the page.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    launchOptions: { executablePath },
  },
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb-anon-placeholder-key-for-perf-run",
      VITE_APP_VERSION: "0.0.0-perf",
    },
  },
});
