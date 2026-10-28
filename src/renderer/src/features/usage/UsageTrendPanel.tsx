/**
 * Compute-unit spend per day, week or month — the one screen that answers
 * "where did my quota go".
 *
 * The curve is reconstructed, not reported: `colab usage` only ever returns a
 * snapshot, so the shape comes from the readings this app recorded (see
 * `main/colab/usage-history.ts`). The chart says so rather than implying the
 * backend keeps books.
 *
 * `UsageTrend` is the view alone, so it can be rendered without a bridge (the
 * static preview does exactly that); `UsageTrendPanel` fetches and holds the
 * chosen granularity.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Usage, UsageBucket, UsageGranularity, UsageTrend as UsageTrendData } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { Card, CardHead, Panel } from "../../components/ui/Card";
import { Callout, EmptyState } from "../../components/ui/Notice";
import { messageOf, usageTrend } from "../../lib/api";
import { formatBucketLabel } from "../../lib/format";
import { useAppStore } from "../../store";
import { UsageChart } from "./UsageChart";

/** Round ceilings; a chart whose top label is 2.15 is harder to read than 2.5. */
const NICE_CEILINGS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * The smallest round number at or above `value`.
 *
 * Bars are drawn against this rather than the peak: using the peak itself puts
 * the tallest bar at 100% and every axis label becomes a figure nobody would
 * write down.
 */
export function chartCeiling(value: number): number {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = NICE_CEILINGS.find((candidate) => normalized <= candidate) ?? 10;
  return step * magnitude;
}

export function UsageTrend({
  trend,
  granularity,
  onGranularity,
  snapshot,
}: {
  trend: UsageTrendData;
  granularity: UsageGranularity;
  onGranularity: (granularity: UsageGranularity) => void;
  /** The live balance/rate reading, if one has landed. */
  snapshot?: Usage | null;
}) {
  const { t } = useTranslation();

  const granularities: [UsageGranularity, string][] = [
    ["day", t("usage.granularityDay", "天")],
    ["week", t("usage.granularityWeek", "周")],
    ["month", t("usage.granularityMonth", "月")],
  ];

  const rangeLabels: Record<UsageGranularity, string> = {
    day: t("usage.rangeDay", "近 30 天"),
    week: t("usage.rangeWeek", "近 12 周"),
    month: t("usage.rangeMonth", "近 6 个月"),
  };

  const averageLabels: Record<UsageGranularity, string> = {
    day: t("usage.metricAverageDay", "日均（CU）"),
    week: t("usage.metricAverageWeek", "周均（CU）"),
    month: t("usage.metricAverageMonth", "月均（CU）"),
  };

  function shortBucketLabel(bucket: UsageBucket): string {
    const key = formatBucketLabel(bucket.key, granularity);
    return granularity === "week" ? t("usage.weekStart", "{{start}} 起", { start: key }) : key;
  }

  const buckets = trend.buckets[granularity];
  const spent = buckets.reduce((sum, bucket) => sum + bucket.units, 0);
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.units), 0);
  const peakBucket = buckets.reduce<UsageBucket | null>(
    (best, bucket) => (best === null || bucket.units > best.units ? bucket : best),
    null,
  );
  const average = buckets.length > 0 ? spent / buckets.length : 0;
  // The axis top is a round number; the bars are a fraction of it, not of the
  // peak, so a quiet day still reads as quiet against the same scale.
  const ceiling = chartCeiling(peak);
  // At a month's width a label per bucket collides; every fifth one reads fine.
  const step = buckets.length > 14 ? 5 : 1;
  const balance = snapshot?.balance ?? null;
  // The window ends now; that bar is the live one and takes the single accent.
  const currentKey = buckets[buckets.length - 1]?.key ?? null;
  // The breakdown lists spend, not the calendar: an interval with neither a
  // reading nor apportioned spend has nothing to break down.
  const rows = [...buckets].reverse().filter((bucket) => bucket.samples > 0 || bucket.units > 0);

  const granularityChoice = (
    <div className="row" role="group" aria-label={t("usage.granularityLabel", "时间粒度")} style={{ gap: "var(--space-1)" }}>
      {granularities.map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant={value === granularity ? "primary" : "outline"}
          aria-pressed={value === granularity}
          onClick={() => onGranularity(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );

  function summaryFact(label: string, value: string, testId: string) {
    return (
      <div className="usage-summary__fact" data-testid={testId}>
        <span className="usage-summary__fact-label">{label}</span>
        <span className="usage-summary__fact-value">{value}</span>
      </div>
    );
  }

  if (trend.first_sample === null) {
    return (
      <Card>
        <CardHead title={t("usage.chartTitle", "消耗走势")} actions={granularityChoice} />
        <EmptyState title={t("usage.emptyTitle", "暂无余额读数")}>
          {t("usage.emptyBody", "查询额度时会记录采样点；产生历史后，将在此显示消耗曲线。")}
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="settings__block usage">
      <Card className="usage-summary">
          <div className="usage-summary__head">
            <span className="usage-summary__eyebrow">{t("usage.periodLabel", "统计区间")}</span>
            {granularityChoice}
          </div>

          <div className="usage-summary__body" data-testid="usage-summary">
            <div className="usage-summary__hero">
              <span className="usage-summary__label">
                {t("usage.summaryLabel", "区间消耗 · {{range}}", { range: rangeLabels[granularity] })}
              </span>
              <div className="usage-summary__value-row">
                <span className="usage-summary__value" data-testid="usage-summary-spend">
                  {spent.toFixed(2)}
                </span>
                <span className="usage-summary__unit">CU</span>
              </div>
            </div>

            <div className="usage-summary__facts">
              {summaryFact(averageLabels[granularity], average.toFixed(2), "usage-summary-average")}
              {summaryFact(t("usage.metricPeak", "峰值（CU）"), peak.toFixed(2), "usage-summary-peak")}
              {summaryFact(
                t("usage.metricBalance", "当前余额（CU）"),
                balance === null ? "—" : balance.toFixed(2),
                "usage-summary-balance",
              )}
            </div>
          </div>
        </Card>

        <Card className="usage-chart">
          <CardHead title={t("usage.chartTitle", "消耗走势")} />

          <p className="trend__scale">
            {peak > 0 && peakBucket
              ? t("usage.peakScale", "{{range}} · 峰值 {{peak}} CU（{{date}}）", {
                  range: rangeLabels[granularity],
                  peak: peak.toFixed(2),
                  date: shortBucketLabel(peakBucket),
                })
              : rangeLabels[granularity]}
          </p>

          {ceiling > 0 ? (
            <UsageChart
              buckets={buckets}
              granularity={granularity}
              ceiling={ceiling}
              currentKey={currentKey}
              step={step}
              ariaLabel={t("usage.plotAriaLabel", "{{range}}消耗 {{spent}} 计算单元", {
                range: rangeLabels[granularity],
                spent: spent.toFixed(2),
              })}
            />
          ) : (
            <div className="trend__flat">
              <p className="trend__no-spend">{t("usage.noSpendInRange", "这一区间没有记录到消耗。")}</p>
            </div>
          )}
        </Card>

      {rows.length > 0 ? (
        <Panel title={t("usage.tableTitle", "区间明细")}>
          <table className="table usage-table" aria-label={t("usage.tableTitle", "区间明细")}>
            <thead>
              <tr>
                <th>{t("usage.tableSpan", "时段")}</th>
                <th className="table__num">{t("usage.tableUnits", "消耗（CU）")}</th>
                <th className="table__num">{t("usage.tableShare", "占比")}</th>
              </tr>
            </thead>
            <tbody>
              {/* Newest first: the row a person looks for is the one that just
                  happened, not the far edge of the window. */}
              {rows.map((bucket) => {
                const current = bucket.key === currentKey;
                const ratio = spent > 0 ? bucket.units / spent : 0;
                const share = Math.round(ratio * 100);
                return (
                  <tr key={bucket.key}>
                    <td className={`table__when ${current ? "usage-table__now" : ""}`.trim()}>
                      {shortBucketLabel(bucket)}
                    </td>
                    <td className="table__num">{bucket.units.toFixed(2)}</td>
                    <td className="table__num">
                      <span className="usage-table__share">
                        <span className="usage-table__share-track" aria-hidden="true">
                          <span className="usage-table__share-fill" style={{ width: `${ratio * 100}%` }} />
                        </span>
                        <span>{share}%</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t("usage.tableTotal", "合计")}</td>
                <td className="table__num">{spent.toFixed(2)}</td>
                <td className="table__num">{spent > 0 ? "100%" : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      ) : null}
    </div>
  );
}

export function UsageTrendPanel() {
  const { t } = useTranslation();
  const [trend, setTrend] = useState<UsageTrendData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<UsageGranularity>("day");
  const usage = useAppStore((state) => state.usage);

  useEffect(() => {
    let live = true;
    usageTrend()
      .then((result) => {
        if (live) setTrend(result);
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <CardHead title={t("usage.chartTitle", "消耗走势")} />
        <Callout tone="danger">{error}</Callout>
      </Card>
    );
  }
  if (!trend) return null;

  return (
    <UsageTrend
      trend={trend}
      granularity={granularity}
      onGranularity={setGranularity}
      snapshot={usage?.usage ?? null}
    />
  );
}
