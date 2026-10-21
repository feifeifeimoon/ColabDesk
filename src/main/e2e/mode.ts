/**
 * The seam that turns the app into a self-contained test target.
 *
 * `COLABDESK_E2E_MOCK=1` swaps the two things a CI container cannot have — a
 * Google account and a reachable runtime — for in-process fakes.
 *
 * Kept free of imports on purpose: domain modules ask this flag, and a unit
 * test that imports one of them must not load Electron. Requiring Electron
 * lazily downloads its binary, and parallel test workers racing that download
 * is enough to fail a job.
 */

export function e2eMockEnabled(): boolean {
  return process.env.COLABDESK_E2E_MOCK === "1";
}
