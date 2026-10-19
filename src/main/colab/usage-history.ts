/**
 * Compute-unit history: the day/week/month curve behind the settings chart.
 *
 * Neither the CLI nor the Colab backend keeps usage history — `colab usage` is
 * a single snapshot (`GET /tun/m/ccu-info`), and that endpoint is the entire
 * billing surface — so the curve exists only because somebody records it. Two
 * sources feed the file: every `usage()` call this app makes, and a one-time
 * backfill from the CLI's own debug log, which happens to keep each response
 * body with a timestamp.
 *
 * Deliberately free of `electron` imports (paths arrive from the composition
 * root) so the arithmetic below stays unit-testable.
 */

import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { UsageBucket, UsageGranularity, UsageReport, UsageTrend } from "@shared/types";

/** One balance reading. `at` is ISO-8601 UTC. */
export interface UsageSample {
  at: string;
  balance: number;
  rate: number;
  assignments: number;
}

/** How many buckets each granularity draws. */
const BUCKET_COUNTS: Record<UsageGranularity, number> = { day: 30, week: 12, month: 6 };

/** The meter resolves to roughly a thousandth of a unit; finer is float noise. */
const UNIT_PRECISION = 1000;

/**
 * A log entry this close to our own first reading is the same request seen
 * twice — the CLI logs the response we then record — not a second reading.
 */
const SAME_READING_MS = 60_000;

const LOG_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}),\d+ - /;
const CCU_BODY =
  /\{\s*"currentBalance"\s*:\s*(-?[\d.eE+]+)\s*,\s*"consumptionRateHourly"\s*:\s*(-?[\d.eE+]+)\s*,\s*"assignmentsCount"\s*:\s*(\d+)/;

/**
 * Every `ccu-info` response in the CLI's debug log, in file order.
 *
 * The log is written by Python's `%(asctime)s`, which is **local** time, and the
 * XSSI prefix (`)]}'\n`) splits a response body across two physical lines — the
 * JSON usually lands on a line carrying no timestamp of its own, so the reader
 * inherits the timestamp of the record it belongs to.
 */
export function parseColabLog(text: string): UsageSample[] {
  const samples: UsageSample[] = [];
  let stamp: Date | null = null;

  for (const line of text.split(/\r?\n/)) {
    const header = LOG_TIMESTAMP.exec(line);
    if (header) {
      stamp = new Date(
        Number(header[1]),
        Number(header[2]) - 1,
        Number(header[3]),
        Number(header[4]),
        Number(header[5]),
        Number(header[6]),
      );
      continue;
    }
    const body = CCU_BODY.exec(line);
    if (!body || !stamp) continue;
    const balance = Number.parseFloat(body[1]);
    const rate = Number.parseFloat(body[2]);
    if (Number.isNaN(balance) || Number.isNaN(rate)) continue;
    samples.push({ at: stamp.toISOString(), balance, rate, assignments: Number(body[3]) });
  }
  return samples;
}

/** Samples already recorded, oldest first; unreadable lines are skipped. */
export function readSamples(file: string): UsageSample[] {
  if (!existsSync(file)) return [];
  const samples: UsageSample[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as UsageSample;
      if (typeof parsed.at === "string" && typeof parsed.balance === "number") samples.push(parsed);
    } catch {
      // A torn last line is worth losing; the next sample re-anchors the curve.
    }
  }
  return samples.sort((a, b) => a.at.localeCompare(b.at));
}

/** Merge two series, keeping one sample per instant. */
export function mergeSamples(...series: UsageSample[][]): UsageSample[] {
  const byInstant = new Map<string, UsageSample>();
  for (const samples of series) {
    for (const sample of samples) byInstant.set(sample.at, sample);
  }
  return [...byInstant.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function startOfBucket(at: Date, granularity: UsageGranularity): Date {
  const year = at.getFullYear();
  const month = at.getMonth();
  if (granularity === "month") return new Date(year, month, 1);
  if (granularity === "week") {
    // Weeks start on Monday: the date people mean by "this week" here, and the
    // one the ISO week number agrees with.
    return new Date(year, month, at.getDate() - ((at.getDay() + 6) % 7));
  }
  return new Date(year, month, at.getDate());
}

function nextBucket(start: Date, granularity: UsageGranularity): Date {
  if (granularity === "month") return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  if (granularity === "week") return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

/**
 * A local-date bucket key for any instant inside that bucket: `2026-10-09` for
 * a day or the Monday of a week, `2026-10` for a month.
 */
export function bucketKey(at: Date, granularity: UsageGranularity): string {
  const start = startOfBucket(at, granularity);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  return granularity === "month" ? date.slice(0, 7) : date;
}

/**
 * Spend per bucket over the trailing window ending at `now`.
 *
 * Each drop between two consecutive readings is spread across the time it
 * covers rather than dropped on the later reading, because the balance settles
 * in batches — it can sit still for half an hour and then jump after a runtime
 * is released. Without the spread, a night with the app closed would report
 * every unit on the morning someone happened to look.
 */
export function bucketize(samples: UsageSample[], granularity: UsageGranularity, now: Date): UsageBucket[] {
  const count = BUCKET_COUNTS[granularity];
  const starts: Date[] = [];
  let cursor = startOfBucket(now, granularity);
  for (let index = 0; index < count; index += 1) {
    starts.unshift(cursor);
    cursor = startOfBucket(new Date(cursor.getTime() - 1), granularity);
  }

  const buckets = new Map<string, UsageBucket>();
  for (const start of starts) {
    buckets.set(bucketKey(start, granularity), { key: bucketKey(start, granularity), units: 0, samples: 0 });
  }

  for (const entry of samples) {
    const bucket = buckets.get(bucketKey(new Date(entry.at), granularity));
    if (bucket) bucket.samples += 1;
  }

  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1];
    const to = samples[index];
    const spend = from.balance - to.balance;
    // A rising balance is a top-up, not negative usage.
    if (spend <= 0) continue;

    const fromMs = new Date(from.at).getTime();
    const toMs = new Date(to.at).getTime();
    const span = toMs - fromMs;
    if (span <= 0) {
      const bucket = buckets.get(bucketKey(new Date(to.at), granularity));
      if (bucket) bucket.units += spend;
      continue;
    }

    // Walk the whole interval, not just the visible part: a drop spread over a
    // month the chart does not show must not land on the window's edge.
    let cursorMs = fromMs;
    while (cursorMs < toMs) {
      const start = startOfBucket(new Date(cursorMs), granularity);
      const end = Math.min(nextBucket(start, granularity).getTime(), toMs);
      // Buckets outside the window are not in the map, so only the visible
      // share of a long gap is counted.
      const bucket = buckets.get(bucketKey(start, granularity));
      if (bucket) bucket.units += (spend * (end - cursorMs)) / span;
      cursorMs = end;
    }
  }

  return starts.map((start) => {
    const bucket = buckets.get(bucketKey(start, granularity)) as UsageBucket;
    return { ...bucket, units: Math.round(bucket.units * UNIT_PRECISION) / UNIT_PRECISION };
  });
}

/** Everything spent across the whole series, top-ups excluded. */
export function totalSpend(samples: UsageSample[]): number {
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const spend = samples[index - 1].balance - samples[index].balance;
    if (spend > 0) total += spend;
  }
  return Math.round(total * UNIT_PRECISION) / UNIT_PRECISION;
}

/**
 * The on-disk history. Append-only, one JSON object per line, under the app's
 * own data directory — the CLI's config directory is not ours to write into.
 */
export class UsageHistory {
  private imported: UsageSample[] | null = null;
  /** Which account the samples belong to, and whether a switch ever happened. */
  private readonly subjectFile: string;
  private readonly rotatedFile: string;

  constructor(
    private readonly file: string,
    /** The CLI's debug log, read once as a backfill for the past. */
    private readonly logFile: string,
  ) {
    this.subjectFile = `${file}.account`;
    this.rotatedFile = `${file}.rotated`;
  }

  /**
   * Notes which account the stored samples belong to; true when it changed.
   *
   * The samples themselves carry no account, because the balance they record
   * has no owner in the endpoint that returns it — so the owner is remembered
   * beside them. First sight is not a change: there was nothing to contradict.
   */
  noteAccount(subject: string | null): boolean {
    if (!subject) return false;
    let previous: string | null = null;
    try {
      previous = readFileSync(this.subjectFile, "utf8").trim() || null;
    } catch {
      previous = null;
    }
    if (previous === subject) return false;
    try {
      writeFileSync(this.subjectFile, subject);
    } catch {
      // A read-only disk costs the detection, never the app.
    }
    return previous !== null;
  }

  /**
   * Starts a new series after an account switch.
   *
   * Spending is not comparable across accounts — the first reading of the new
   * one makes a delta against the last of the old one, which reads as a huge
   * spend or a top-up that never happened — so the old samples are moved aside
   * (they are the other account's history, still readable) and the curve starts
   * from the first reading of the new account. The CLI's log stops being
   * backfilled for the same reason.
   */
  rotate(now = new Date()): void {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    try {
      if (existsSync(this.file)) renameSync(this.file, `${this.file}.${stamp}`);
      writeFileSync(this.rotatedFile, stamp);
    } catch {
      // Nothing was lost: the series simply restarts around the old samples.
    }
    this.imported = [];
  }

  /** Records a reading. Never throws: history must not break the status bar. */
  record(report: UsageReport): void {
    const balance = report.usage.balance;
    if (!report.ok || balance === null) return;
    const sample: UsageSample = {
      at: new Date().toISOString(),
      balance,
      rate: report.usage.rate ?? 0,
      assignments: report.usage.assignments ?? 0,
    };
    try {
      appendFileSync(this.file, `${JSON.stringify(sample)}\n`);
    } catch {
      // A read-only or full disk costs the history, never the reading in hand.
    }
  }

  /**
   * Backfills everything older than the first sample we recorded ourselves. The
   * import is cached: the past does not change, and the log only grows.
   */
  private backfill(): UsageSample[] {
    if (this.imported) return this.imported;
    // After a switch the CLI's log belongs to another account; importing it
    // would put two accounts on one curve.
    if (existsSync(this.rotatedFile)) return (this.imported = []);
    const stored = readSamples(this.file);
    const earliest = stored[0]?.at;
    let imported: UsageSample[] = [];
    try {
      if (existsSync(this.logFile)) {
        imported = parseColabLog(readFileSync(this.logFile, "utf8"));
      }
    } catch {
      imported = [];
    }
    this.imported = earliest
      ? imported.filter(
          (sample) => new Date(sample.at).getTime() < new Date(earliest).getTime() - SAME_READING_MS,
        )
      : imported;
    return this.imported;
  }

  trend(now = new Date()): UsageTrend {
    const stored = readSamples(this.file);
    const samples = mergeSamples(this.backfill(), stored);
    return {
      buckets: {
        day: bucketize(samples, "day", now),
        week: bucketize(samples, "week", now),
        month: bucketize(samples, "month", now),
      },
      total: totalSpend(samples),
      first_sample: samples[0]?.at ?? null,
      last_sample: samples[samples.length - 1]?.at ?? null,
    };
  }
}
