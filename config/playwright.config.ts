import { defineConfig } from "@playwright/test";

/**
 * E2E config sits with the other tool configs; the specs live in `tests/e2e/`.
 *
 * Nothing here downloads a browser: the subject is an Electron app and
 * Playwright drives it through its own binary, so `playwright install` is never
 * part of the setup.
 */
export default defineConfig({
  testDir: "../tests/e2e",
  globalSetup: "./e2e-global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Every test launches its own app against its own sandbox. One at a time on
  // CI, where two Electron instances contend for the same virtual display.
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  // This suite exists to be a stable gate, so a retry would hide exactly the
  // flakiness it is meant to catch.
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // The gate: everything that asserts behaviour, and only that.
    { name: "app", testMatch: "**/*.spec.ts", grepInvert: /@gallery/ },
    // On demand: the screenshots a person looks at (`npm run gallery`).
    { name: "gallery", testMatch: "**/*.spec.ts", grep: /@gallery/ },
  ],
});
