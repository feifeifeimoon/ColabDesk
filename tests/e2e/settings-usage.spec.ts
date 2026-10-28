/**
 * The usage page as a person reads it: a summary they can quote, a chart whose
 * scale is stated, and a breakdown that repeats every bucket without hovering.
 *
 * The sandbox has no history of its own, so this spec plants the same kind of
 * daily readings the app records when it checks quota, then opens the section.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./app-launch";

test("usage page shows the summary, the chart and the breakdown", async ({ page, sandbox }) => {
  const day = 24 * 60 * 60 * 1000;
  // Two readings six days apart: 3.5 units are apportioned across the gap, so
  // the days between are inferred (no readings) rather than measured zeros.
  // The last reading is the mock CLI's 42.50, so the live balance agrees with
  // the end of the curve and the current bucket carries a visible bar.
  const balances = [46, 42.5];
  const times = [Date.now() - 6 * day, Date.now() - 60 * 60 * 1000];
  const samples = balances.map((balance, index) =>
    JSON.stringify({
      at: new Date(times[index]).toISOString(),
      balance,
      rate: 1.25,
      assignments: 1,
    }),
  );
  mkdirSync(join(sandbox, "user-data"), { recursive: true });
  writeFileSync(join(sandbox, "user-data", "usage-history.jsonl"), `${samples.join("\n")}\n`);

  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "用量趋势" }).click();

  await expect(page.getByTestId("usage-summary")).toBeVisible();
  await expect(page.getByTestId("usage-summary-spend")).toContainText("3.50");
  await expect(page.getByTestId("usage-summary-average")).toContainText("日均（CU）");
  await expect(page.getByTestId("usage-summary-peak")).toBeVisible();
  await expect(page.getByTestId("usage-summary-balance")).toContainText("42.50");
  await expect(page.getByText("记录始于")).toHaveCount(0);

  await expect(page.getByTestId("usage-trend-plot")).toBeVisible();
  await expect(page.locator(".trend__legend")).toHaveCount(0);
  await expect(page.locator(".recharts-yAxis")).toHaveCount(1);
  await expect(page.locator(".recharts-xAxis-tick-labels text").last()).toHaveAttribute("fill", "var(--link)");
  await expect(page.locator('.trend__chart path[data-current="true"]')).toHaveAttribute("fill", "var(--link)");

  await expect(page.getByRole("table", { name: "区间明细" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "区间明细" }).locator("thead th"),
  ).toHaveCount(3);
  await expect(page.getByRole("columnheader", { name: "读数" })).toHaveCount(0);
  await expect(page.locator("tfoot")).toContainText("合计");
  await expect(page.locator("tfoot")).toContainText("100%");

  // Hovering a bar restates that bucket; the table below is the path that does
  // not need a pointer.
  const bar = page.locator(".trend__bar-group:has(path)").first();
  await bar.hover();
  await expect(page.locator(".trend__tooltip")).toBeVisible();
  await expect(page.locator(".trend__tooltip")).toContainText("计算单元");

  // The chart draws one group per bucket: 30 days, 12 weeks. The breakdown
  // only lists buckets that carry a reading or apportioned spend.
  const rows = page.getByRole("table", { name: "区间明细" }).locator("tbody tr");
  await expect(page.locator(".trend__bar-group")).toHaveCount(30);
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: "周", exact: true }).click();
  await expect(page.getByRole("button", { name: "周", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("usage-summary-average")).toContainText("周均（CU）");
  await expect(page.locator(".trend__bar-group")).toHaveCount(12);
  await expect(rows.first()).toContainText("起");
});
