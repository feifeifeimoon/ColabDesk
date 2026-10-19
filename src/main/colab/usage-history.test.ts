import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  UsageHistory,
  bucketKey,
  bucketize,
  mergeSamples,
  parseColabLog,
  totalSpend,
  type UsageSample,
} from "./usage-history";

/** A sample at a local wall-clock instant, so the assertions hold in any zone. */
function sample(
  year: number,
  month: number,
  day: number,
  hour: number,
  balance: number,
  minute = 0,
): UsageSample {
  return { at: new Date(year, month - 1, day, hour, minute).toISOString(), balance, rate: 1.07, assignments: 1 };
}

describe("parseColabLog", () => {
  it("reads the balance body that the XSSI prefix pushed onto its own line", () => {
    const log = [
      "2026-10-09 11:20:36,166 - colab_cli.client - DEBUG - Request: GET https://x/tun/m/ccu-info",
      "2026-10-09 11:20:37,005 - colab_cli.client - DEBUG - Response Body: )]}'",
      '{"currentBalance":399.9252840325256,"consumptionRateHourly":1.07,"assignmentsCount":1,"eligibleGpus":["T4"]}',
      "2026-10-09 11:25:37,005 - colab_cli.client - DEBUG - Response Body: )]}'",
      '{"currentBalance":399.5,"consumptionRateHourly":1.07,"assignmentsCount":1}',
    ].join("\n");

    const samples = parseColabLog(log);
    expect(samples).toHaveLength(2);
    expect(samples[0].balance).toBe(399.9252840325256);
    expect(samples[1].balance).toBe(399.5);
    // `%(asctime)s` is local time; the reader's own zone is what it means.
    expect(new Date(samples[1].at).getHours()).toBe(11);
    expect(samples[1].assignments).toBe(1);
  });

  it("keeps a multi-line body and CRLF endings straight", () => {
    const log = [
      "2026-10-09 08:00:00,000 - colab_cli.client - DEBUG - Response Body: )]}'\r",
      '{"currentBalance":10.5,"consumptionRateHourly":0,"assignmentsCount":0}\r',
    ].join("\n");
    expect(parseColabLog(log)).toHaveLength(1);
  });

  it("ignores bodies that no timestamp precedes and unrelated log lines", () => {
    expect(parseColabLog('{"currentBalance":5,"consumptionRateHourly":0,"assignmentsCount":0}')).toEqual([]);
    expect(parseColabLog("2026-10-09 08:00:00,000 - x - DEBUG - nothing here")).toEqual([]);
  });
});

describe("bucketKey", () => {
  it("keys days and months by their local date", () => {
    expect(bucketKey(new Date(2026, 9, 9), "day")).toBe("2026-10-09");
    expect(bucketKey(new Date(2026, 9, 9), "month")).toBe("2026-10");
  });

  it("keys a week by the Monday it starts on", () => {
    // 2026-10-09 is a Friday; its week opened on Monday the 5th.
    expect(bucketKey(new Date(2026, 9, 9), "week")).toBe("2026-10-05");
    // A Monday is its own key, and Sunday belongs to the week before it.
    expect(bucketKey(new Date(2026, 9, 5), "week")).toBe("2026-10-05");
    expect(bucketKey(new Date(2026, 9, 11), "week")).toBe("2026-10-05");
  });
});

describe("bucketize", () => {
  const now = new Date(2026, 9, 9, 18, 0);

  it("returns a gapless window ending today, newest last", () => {
    const buckets = bucketize([], "day", now);
    expect(buckets).toHaveLength(30);
    expect(buckets[buckets.length - 1].key).toBe("2026-10-09");
    expect(buckets[0].key).toBe("2026-09-10");
    expect(buckets.every((bucket) => bucket.units === 0 && bucket.samples === 0)).toBe(true);
    expect(bucketize([], "week", now)).toHaveLength(12);
    expect(bucketize([], "month", now)).toHaveLength(6);
  });

  it("books a drop to the interval it covers", () => {
    const buckets = bucketize([sample(2026, 10, 9, 10, 400), sample(2026, 10, 9, 12, 397.86)], "day", now);
    const today = buckets.find((bucket) => bucket.key === "2026-10-09");
    expect(today?.units).toBeCloseTo(2.14, 3);
    expect(today?.samples).toBe(2);
  });

  it("splits a drop across buckets when the app was closed over the boundary", () => {
    // 23:00 → 01:00 with two units gone: an hour belongs to each day.
    const buckets = bucketize([sample(2026, 10, 8, 23, 100), sample(2026, 10, 9, 1, 98)], "day", now);
    const eighth = buckets.find((bucket) => bucket.key === "2026-10-08");
    const ninth = buckets.find((bucket) => bucket.key === "2026-10-09");
    expect(eighth?.units).toBeCloseTo(1, 3);
    expect(ninth?.units).toBeCloseTo(1, 3);
    // The day nobody looked is still marked unmeasured.
    expect(eighth?.samples).toBe(1);
  });

  it("treats a rising balance as a top-up, not negative usage", () => {
    const buckets = bucketize([sample(2026, 10, 9, 9, 10), sample(2026, 10, 9, 10, 210)], "day", now);
    const today = buckets.find((bucket) => bucket.key === "2026-10-09");
    expect(today?.units).toBe(0);
  });

  it("attributes spend proportionally inside a week and a month", () => {
    const week = bucketize([sample(2026, 10, 8, 0, 50), sample(2026, 10, 10, 0, 46)], "week", now);
    const current = week[week.length - 1];
    expect(current.key).toBe("2026-10-05");
    expect(current.units).toBeCloseTo(4, 3);

    const month = bucketize([sample(2026, 9, 30, 12, 50), sample(2026, 10, 2, 12, 48)], "month", now);
    // 48 hours apart, 12 of them still in September.
    expect(month[month.length - 2].key).toBe("2026-09");
    expect(month[month.length - 2].units).toBeCloseTo(0.5, 3);
    expect(month[month.length - 1].units).toBeCloseTo(1.5, 3);
  });

  it("ignores history older than the window", () => {
    const buckets = bucketize([sample(2026, 1, 1, 0, 900), sample(2026, 1, 2, 0, 899)], "day", now);
    expect(buckets.reduce((sum, bucket) => sum + bucket.units, 0)).toBe(0);
  });

  it("does not push a long absence onto the window's edge", () => {
    // Six months away, 60 units gone: the visible month gets its own share of
    // the elapsed time, not the whole drop.
    const buckets = bucketize([sample(2026, 4, 1, 12, 100), sample(2026, 10, 9, 12, 40)], "day", now);
    const spent = buckets.reduce((sum, bucket) => sum + bucket.units, 0);
    const days = (new Date(2026, 9, 9, 12).getTime() - new Date(2026, 8, 10).getTime()) / 86_400_000;
    expect(spent).toBeCloseTo((60 * days) / 191, 1);
  });
});

describe("totalSpend", () => {
  it("sums the drops and skips the top-ups", () => {
    const samples = [
      sample(2026, 10, 9, 9, 100),
      sample(2026, 10, 9, 10, 98),
      sample(2026, 10, 9, 11, 198),
      sample(2026, 10, 9, 12, 197.5),
    ];
    expect(totalSpend(samples)).toBeCloseTo(2.5, 6);
    expect(totalSpend([])).toBe(0);
  });
});

describe("mergeSamples", () => {
  it("keeps one reading per instant, oldest first", () => {
    const merged = mergeSamples([sample(2026, 10, 9, 12, 2)], [sample(2026, 10, 9, 10, 1), sample(2026, 10, 9, 12, 3)]);
    expect(merged.map((entry) => entry.balance)).toEqual([1, 3]);
  });
});

describe("UsageHistory and the account behind it", () => {
  let directory = "";

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
    directory = "";
  });

  const history = (): { history: UsageHistory; file: string; log: string } => {
    directory = mkdtempSync(join(tmpdir(), "colabdesk-history-"));
    const file = join(directory, "usage.jsonl");
    const log = join(directory, "colab.log");
    return { history: new UsageHistory(file, log), file, log };
  };

  it("第一次看到账号不算切换，换一个才算", () => {
    const { history: store } = history();

    expect(store.noteAccount("subject-a")).toBe(false);
    expect(store.noteAccount("subject-a")).toBe(false);
    expect(store.noteAccount("subject-b")).toBe(true);
    expect(store.noteAccount(null)).toBe(false);
  });

  it("切换账号后曲线从零开始：旧样本挪到一边，CLI 日志也不再回填", () => {
    const { history: store, file, log } = history();
    // The backfill alone would give the curve a reading.
    writeFileSync(
      log,
      [
        "2026-09-01 10:00:00,000 - colab_cli.client - DEBUG - Response Body: )]}'",
        '{"currentBalance":500,"consumptionRateHourly":0,"assignmentsCount":0}',
      ].join("\n"),
    );
    expect(store.trend().first_sample).not.toBeNull();

    store.rotate(new Date("2026-10-19T12:00:00.000Z"));

    expect(existsSync(file)).toBe(false);
    expect(readdirSync(directory).some((name) => name.startsWith("usage.jsonl."))).toBe(true);
    // Another account's spend must not sit on this account's curve.
    expect(store.trend().first_sample).toBeNull();
  });

  it("转动时把已有样本原样保留在旁边的文件里", () => {
    const { history: store, file } = history();
    const sample = { at: "2026-10-18T10:00:00.000Z", balance: 400, rate: 1, assignments: 1 };
    writeFileSync(file, `${JSON.stringify(sample)}\n`);
    store.rotate(new Date("2026-10-19T12:00:00.000Z"));

    const kept = readdirSync(directory).find((name) => name.startsWith("usage.jsonl."));
    expect(kept, "旧样本应当留在磁盘上").toBeDefined();
    expect(readFileSync(join(directory, kept as string), "utf8")).toContain("400");
  });
});
