import { describe, expect, it } from "vitest";

import { formatCount, totalDownloads } from "./github.js";

describe("formatCount", () => {
  it("keeps small counts exact", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });

  it("rounds to one decimal below a hundred thousand and to whole thousands above", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(98600)).toBe("98.6k");
    expect(formatCount(150000)).toBe("150k");
  });

  it("switches to millions instead of printing 1000k", () => {
    expect(formatCount(1_000_000)).toBe("1m");
    expect(formatCount(1_500_000)).toBe("1.5m");
  });

  it("returns null for anything that is not a count, so the badge can stay hidden", () => {
    expect(formatCount(null)).toBeNull();
    expect(formatCount(undefined)).toBeNull();
    expect(formatCount("")).toBeNull();
    expect(formatCount("abc")).toBeNull();
    expect(formatCount(-1)).toBeNull();
  });
});

describe("totalDownloads", () => {
  it("adds up every asset of every release, update metadata included", () => {
    const releases = [
      {
        assets: [
          { name: "colabdesk-setup-0.3.0-x64.exe", download_count: 40 },
          { name: "colabdesk-0.3.0-arm64.dmg", download_count: 12 },
          { name: "latest.yml", download_count: 3 },
        ],
      },
      { assets: [{ name: "colabdesk-setup-0.2.0-x64.exe", download_count: 5 }] },
    ];
    expect(totalDownloads(releases)).toBe(60);
    expect(formatCount(totalDownloads(releases))).toBe("60");
  });

  it("treats a published release with no downloads yet as zero", () => {
    expect(totalDownloads([{ assets: [] }])).toBe(0);
    expect(totalDownloads([])).toBe(0);
  });

  it("skips malformed entries instead of poisoning the total with NaN", () => {
    const releases = [
      { assets: [{ download_count: 4 }, { download_count: "12" }, { download_count: "abc" }, {}] },
      { assets: null },
      null,
      {},
    ];
    expect(totalDownloads(releases)).toBe(16);
  });

  it("returns null when the answer is not a release list, so the caption stays hidden", () => {
    expect(totalDownloads(null)).toBeNull();
    expect(totalDownloads(undefined)).toBeNull();
    expect(totalDownloads({ message: "API rate limit exceeded" })).toBeNull();
  });
});
