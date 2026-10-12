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
import type { UsageBucket, UsageGranularity, UsageTrend as UsageTrendData } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { Card, CardHead } from "../../components/ui/Card";
import { Callout, EmptyState } from "../../components/ui/Notice";
import { messageOf, usageTrend } from "../../lib/api";
import { formatBucketLabel, formatReading } from "../../lib/format";

export function UsageTrend({
  trend,
  granularity,
  onGranularity,
}: {
  trend: UsageTrendData;
  granularity: UsageGranularity;
  onGranularity: (granularity: UsageGranularity) => void;
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

  function describe(bucket: UsageBucket): string {
    const span = granularity === "week" ? t("usage.weekSpan", "{{start}} 起的一周", { start: bucket.key }) : bucket.key;
    const units = t("usage.unitsDesc", "{{units}} 计算单元", { units: bucket.units.toFixed(2) });
    if (bucket.samples === 0) {
      return bucket.units > 0
        ? t("usage.inferredSpan", "{{span}} · {{units}}（推算：这一段没有读数）", { span, units })
        : t("usage.noSampleSpan", "{{span}} · 没有采样（不等于零消耗）", { span });
    }
    return bucket.units > 0
      ? t("usage.sampledSpan", "{{span}} · {{units}} · 采样 {{samples}} 次", { span, units, samples: bucket.samples })
      : t("usage.noSpendSpan", "{{span}} · 没有消耗", { span });
  }

  const buckets = trend.buckets[granularity];
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.units), 0);
  const spent = buckets.reduce((sum, bucket) => sum + bucket.units, 0);
  const unread = buckets.filter((bucket) => bucket.samples === 0);
  // Spend that landed in a stretch nobody was reading is spread in from the
  // readings on either side, so it is an estimate and the note has to say so.
  const inferred = unread.reduce((sum, bucket) => sum + bucket.units, 0);
  // At a month's width a label per bucket collides; every fifth one reads fine.
  const step = buckets.length > 14 ? 5 : 1;

  const unreadNote = unread.length > 0 ? t("usage.unreadPart", "，其中 {{count}} 段没有读数", { count: unread.length }) : "";
  const inferredNote = inferred > 0 ? t("usage.inferredPart", "（{{units}} 按相邻读数推算）", { units: inferred.toFixed(2) }) : "";

  return (
    <Card>
      <CardHead
        title={t("usage.trendTitle", "用量趋势")}
        description={t("usage.trendDescription", "两次余额读数的下降，就是这段时间消耗的计算单元。")}
        actions={
          <div className="row" style={{ gap: "var(--space-1)" }}>
            {granularities.map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={value === granularity ? "primary" : "outline"}
                onClick={() => onGranularity(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        }
      />

      {trend.first_sample === null ? (
        <EmptyState title={t("usage.emptyTitle", "还没有余额读数")}>
          {t("usage.emptyBody", "应用每次向 colab CLI 查额度都会记一条，跑一会儿再回来，这里就有曲线了。")}
        </EmptyState>
      ) : (
        <>
          <p className="trend__scale">
            {t("usage.peakScale", "{{range}} · 峰值 {{peak}} 计算单元", {
              range: rangeLabels[granularity],
              peak: peak.toFixed(2),
            })}
          </p>
          <div
            className="trend__plot"
            role="img"
            aria-label={t("usage.plotAriaLabel", "{{range}}消耗 {{spent}} 计算单元", {
              range: rangeLabels[granularity],
              spent: spent.toFixed(2),
            })}
          >
            {buckets.map((bucket) => (
              <div
                key={bucket.key}
                className={`trend__slot ${bucket.samples === 0 ? "trend__slot--unmeasured" : ""}`.trim()}
                title={describe(bucket)}
              >
                {bucket.units > 0 && (
                  <div className="trend__bar" style={{ height: `max(2px, ${(bucket.units / peak) * 100}%)` }} />
                )}
              </div>
            ))}
          </div>
          <div className="trend__labels">
            {buckets.map((bucket, index) => (
              <span key={bucket.key} className="trend__label">
                {index % step === 0 ? formatBucketLabel(bucket.key, granularity) : ""}
              </span>
            ))}
          </div>
          <p className="trend__note">
            {t("usage.totalNote", "合计 {{spent}} 计算单元{{unreadNote}}{{inferredNote}}；记录始于 {{start}}。", {
              spent: spent.toFixed(2),
              unreadNote,
              inferredNote,
              start: formatReading(trend.first_sample),
            })}
          </p>
          <p className="hint">
            {t("usage.batchHint", "余额是按批结算的，读数之间的消耗按时间摊到各区间，因此曲线适合看天以上的粒度。")}
          </p>
        </>
      )}
    </Card>
  );
}

export function UsageTrendPanel() {
  const { t } = useTranslation();
  const [trend, setTrend] = useState<UsageTrendData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<UsageGranularity>("day");

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
        <CardHead title={t("usage.trendTitle", "用量趋势")} />
        <Callout tone="danger">{error}</Callout>
      </Card>
    );
  }
  if (!trend) return null;

  return <UsageTrend trend={trend} granularity={granularity} onGranularity={setGranularity} />;
}
