/**
 * The usage page's readable rules, rendered as markup.
 *
 * The chart is an estimate drawn from readings this app happened to take, so
 * the screen has to keep three promises: the range total, its scale and the
 * inferred spans are stated in words; the breakdown carries the same numbers
 * for anyone who cannot hover; and a span with no reading is never drawn as
 * zero spend.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UsageBucket, UsageTrend } from "@shared/types";
import "../../i18n/i18n";

// The view is pure, but its module also exports the panel that reads the store.
// Mocking the store keeps this test out of the renderer-only theme watcher.
const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { chartCeiling, UsageTrend as UsageTrendView } from "./UsageTrendPanel";

const DAY_BUCKETS: UsageBucket[] = [
  { key: "2026-10-01", units: 1, samples: 1 },
  { key: "2026-10-02", units: 2, samples: 2 },
  // Spend can land in a span nobody read: it is drawn, with a dashed baseline,
  // and the table still says there was no reading there.
  { key: "2026-10-03", units: 0.5, samples: 0 },
];

const trend = (buckets: UsageBucket[], first: string | null = "2026-10-01T12:00:00.000Z"): UsageTrend => ({
  buckets: { day: buckets, week: buckets, month: buckets },
  total: buckets.reduce((sum, bucket) => sum + bucket.units, 0),
  first_sample: first,
  last_sample: first === null ? null : "2026-10-03T12:00:00.000Z",
});

const render = (data: UsageTrend): string =>
  renderToStaticMarkup(
    createElement(UsageTrendView, {
      trend: data,
      granularity: "day",
      onGranularity: () => {},
      snapshot: { balance: 42.5, rate: 1.25, assignments: 1 },
    }),
  );

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("the chart's scale", () => {
  it("rounds the axis top up to a number a person would write", () => {
    expect(chartCeiling(0)).toBe(0);
    expect(chartCeiling(0.7)).toBe(0.8);
    expect(chartCeiling(1.8)).toBe(2);
    expect(chartCeiling(2.15)).toBe(2.5);
    expect(chartCeiling(43.22)).toBe(50);
  });
});

describe("the usage trend", () => {
  it("states the range total, the average and the peak before the chart", () => {
    const rendered = text(render(trend(DAY_BUCKETS)));

    expect(rendered).toContain("区间消耗 · 近 30 天");
    expect(rendered).toContain("3.50");
    expect(rendered).toContain("日均（CU）");
    expect(rendered).toContain("1.17");
    expect(rendered).toContain("峰值（CU）");
    expect(rendered).toContain("2.00");
    expect(rendered).toContain("当前余额（CU）");
    expect(rendered).toContain("42.50");
  });

  it("mounts the chart without a second peak caption", () => {
    const html = render(trend(DAY_BUCKETS));

    // Recharts owns the SVG internals; the wrapper and the card copy are what
    // this component can be held to without a DOM.
    expect(html).toContain('data-testid="usage-trend-plot"');
    // The peak is one fact in the summary strip; the chart card does not
    // repeat it as a caption above the plot.
    expect(text(html)).not.toContain("· 峰值");
  });

  it("carries every measured or inferred bucket into the breakdown and totals it", () => {
    const html = render(trend(DAY_BUCKETS));
    const rows = html.match(/<tr/g) ?? [];

    expect(text(html)).toContain("区间明细");
    expect(rows).toHaveLength(5); // heading + three rows with data + total
    expect(text(html)).toContain("10-03");
    expect(text(html)).toContain("0.50");
    expect(text(html)).toContain("合计");
    expect(text(html)).toContain("100%");
    // The breakdown is the chart's accessible twin, so it states the share too.
    expect(text(html)).toContain("57%");
    expect(html).toContain("usage-table__share");
  });

  it("keeps reading counts and record-start copy off the spend page", () => {
    const rendered = text(render(trend(DAY_BUCKETS)));

    expect(rendered).not.toContain("无读数");
    expect(rendered).not.toContain("读数");
    expect(rendered).not.toContain("记录始于");
    expect(rendered).not.toContain("按批次结算");
    expect(rendered).not.toContain("合计 3.50 计算单元");
  });

  it("drops a bucket with neither a reading nor spend instead of calling it 0.00", () => {
    const html = render(trend([{ key: "2026-10-04", units: 0, samples: 0 }]));
    const rendered = text(html);

    expect(rendered).toContain("这一区间没有记录到消耗");
    // No scale to draw, so the flat well replaces the chart.
    expect(html).toContain("trend__flat");
    expect(html).not.toContain("区间明细");
  });

  it("shows the next step when there is no history instead of an empty chart", () => {
    const rendered = text(render(trend([], null)));

    expect(rendered).toContain("暂无余额读数");
    expect(rendered).toContain("查询额度时会记录采样点");
    expect(rendered).not.toContain("区间明细");
  });
});
