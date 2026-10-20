import { describe, expect, it } from "vitest";

import { formatStars } from "./github.js";

describe("formatStars", () => {
  it("keeps small counts exact", () => {
    expect(formatStars(0)).toBe("0");
    expect(formatStars(999)).toBe("999");
  });

  it("rounds to one decimal below a hundred thousand and to whole thousands above", () => {
    expect(formatStars(1000)).toBe("1k");
    expect(formatStars(1234)).toBe("1.2k");
    expect(formatStars(98600)).toBe("98.6k");
    expect(formatStars(150000)).toBe("150k");
  });

  it("switches to millions instead of printing 1000k", () => {
    expect(formatStars(1_000_000)).toBe("1m");
    expect(formatStars(1_500_000)).toBe("1.5m");
  });

  it("returns null for anything that is not a count, so the badge can stay hidden", () => {
    expect(formatStars(null)).toBeNull();
    expect(formatStars(undefined)).toBeNull();
    expect(formatStars("")).toBeNull();
    expect(formatStars("abc")).toBeNull();
    expect(formatStars(-1)).toBeNull();
  });
});
