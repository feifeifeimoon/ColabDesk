/**
 * The usage chart, drawn by Recharts rather than by hand.
 *
 * Recharts is SVG, so the bars, axes and grid take their colours from the app's
 * CSS variables and flip with the theme without a second palette. The chart is
 * presentational: the breakdown table below carries the same numbers for
 * keyboard and screen-reader users.
 */

import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BarShapeProps, TooltipContentProps, XAxisTickContentProps } from "recharts";
import type { UsageBucket, UsageGranularity } from "@shared/types";
import { formatBucketLabel } from "../../lib/format";

interface UsageChartProps {
  buckets: UsageBucket[];
  granularity: UsageGranularity;
  /** The rounded axis top; bars are a fraction of this, not of the peak. */
  ceiling: number;
  /** The bucket the window ends on; it gets the single link-blue accent. */
  currentKey: string | null;
  /** Label every Nth category, and always the last one. */
  step: number;
  ariaLabel: string;
}

/** Axis labels drop trailing zeros without losing a meaningful decimal. */
function formatAxis(value: number): string {
  return value === 0 ? "0" : String(Number(value.toFixed(2)));
}

/**
 * A rounded-top bar, with the live bucket taking the single link accent.
 */
function UsageBar({ currentKey, x, y, width, height, payload }: BarShapeProps & { currentKey: string | null }) {
  const bucket = payload as UsageBucket | undefined;
  const current = bucket?.key === currentKey;
  const radius = Math.min(4, width / 2, height);
  const path =
    height > 0
      ? `M${x},${y + height} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + width - radius},${y} Q${x + width},${y} ${x + width},${y + radius} L${x + width},${y + height} Z`
      : null;

  return (
    <g className="trend__bar-group">
      {bucket && bucket.units > 0 && path ? (
        <path
          d={path}
          fill={current ? "var(--link)" : "var(--ink)"}
          data-current={current ? "true" : undefined}
        />
      ) : null}
    </g>
  );
}

export function UsageChart({
  buckets,
  granularity,
  ceiling,
  currentKey,
  step,
  ariaLabel,
}: UsageChartProps) {
  const { t } = useTranslation();
  const data = buckets.map((bucket) => ({
    ...bucket,
    label: formatBucketLabel(bucket.key, granularity),
  }));

  function describe(bucket: UsageBucket): string {
    const span = granularity === "week" ? t("usage.weekSpan", "{{start}} 起的一周", { start: bucket.key }) : bucket.key;
    const units = t("usage.unitsDesc", "{{units}} 计算单元", { units: bucket.units.toFixed(2) });
    return `${span} · ${units}`;
  }

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const bucket = props.payload[0]?.payload as (UsageBucket & { label: string }) | undefined;
    if (!bucket) return null;
    return (
      <div className="trend__tooltip">
        {describe(bucket)
          .split(" · ")
          .map((line, index) => (
            <span key={index} className="trend__tooltip-line">
              {line}
            </span>
          ))}
      </div>
    );
  };

  const renderXAxisTick = ({ x, y, payload, index, visibleTicksCount }: XAxisTickContentProps) => {
    const last = index === visibleTicksCount - 1;
    if (index % step !== 0 && !last) return null;
    return (
      <text
        x={x}
        y={y}
        dy={12}
        textAnchor="middle"
        fill={last ? "var(--link)" : "var(--mute)"}
        fontFamily="var(--font-mono)"
        fontSize={11}
        data-current={last ? "true" : undefined}
      >
        {String(payload.value)}
      </text>
    );
  };

  return (
    <div className="trend__chart" role="img" aria-label={ariaLabel} data-testid="usage-trend-plot">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
          barCategoryGap="25%"
          barGap={0}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--grid-line)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            height={28}
            interval={0}
            tick={renderXAxisTick}
          />
          <YAxis
            domain={[0, ceiling]}
            ticks={[0, ceiling / 2, ceiling]}
            tickFormatter={formatAxis}
            axisLine={false}
            tickLine={false}
            width={44}
            tick={{ fill: "var(--mute)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ fill: "var(--canvas-soft-2)", fillOpacity: 0.55 }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="units"
            isAnimationActive={false}
            minPointSize={1}
            maxBarSize={28}
            shape={(props: BarShapeProps) => <UsageBar {...props} currentKey={currentKey} />}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
