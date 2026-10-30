/**
 * The front door's capability grid, at the width where its column changes.
 *
 * The grid is a 2×2 below 632px of column width and four across above it, so a
 * narrow window (or a zoomed UI) never leaves the fourth capability alone
 * under the first column. The assertion is the visible arrangement — which
 * items share a row — not the CSS property that produced it.
 */

import { expect, test } from "./app-launch";

test("窄窗口下能力区排成 2×2，而不是 3+1", async ({ app, page }) => {
  const features = page.locator(".startpage__features");
  await expect(features).toBeVisible();

  const tops = () =>
    features
      .locator("li")
      .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));

  // The default window gives the column its full 760px: four across, one row.
  await expect.poll(async () => new Set(await tops()).size).toBe(1);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(900, 740);
  });

  // At the supported floor the rail takes enough of the middle that the fourth
  // track no longer fits: two rows of two.
  await expect.poll(async () => new Set(await tops()).size).toBe(2);
  const rows = await tops();
  expect(rows[0]).toBe(rows[1]);
  expect(rows[2]).toBe(rows[3]);
  expect(rows[2]).toBeGreaterThan(rows[0]);
});
