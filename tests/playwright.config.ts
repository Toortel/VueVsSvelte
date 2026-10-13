/**
 * Playwright config – benchmark & regression tests for Vue / Svelte.
 *
 * Each framework runs on its own production preview port. We use Chromium only
 * (performance benchmarks should be single-browser for fair comparison).
 *
 * Test results are written to:
 *   - playwright-report/          (HTML report)
 *   - benchmark-results/          (JSON results)
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts", // clears result spill files from previous runs
  timeout: 120_000,          // 2 min – nested tree can be slow
  retries: 0,                // no retries for benchmarks
  workers: 1,                // sequential – avoids CPU contention
  fullyParallel: false,

  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "benchmark-results/playwright-results.json" }],
    ["list"],
  ],

  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 60_000,
    // No video/screenshots for benchmark accuracy
    video: "off",
    screenshot: "off",
    trace: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          args: [
            "--enable-precise-memory-info",
            "--js-flags=--expose-gc",
            // In Docker, use disk-backed /tmp instead of RAM-backed /dev/shm
            "--disable-dev-shm-usage",
          ],
        },
      },
    },
  ],

  /* Start production-built servers before tests run.
     Each frontend is built (vite build) then served via vite preview.
     Playwright will wait for each URL to respond before proceeding. */
  webServer: [
    {
      command: "npm run serve",
      cwd: "../services/backend-api",
      url: "http://localhost:3001/api/reports",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run serve",
      cwd: "../apps/frontend-vue",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run serve",
      cwd: "../apps/frontend-svelte-plain",
      url: "http://localhost:5174",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
