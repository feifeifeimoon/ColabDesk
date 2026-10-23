import { describe, expect, it } from "vitest";
import type { TransferProgress } from "@shared/types";
import { MAX_TRANSFER_ROWS, mergeTransferProgress } from "./transfer-list";

const transfer = (id: string, transferred = 0): TransferProgress => ({
  id,
  session: "alpha",
  direction: "upload",
  name: `${id}.bin`,
  transferred,
  total: 100,
  done: false,
  error: null,
});

describe("mergeTransferProgress", () => {
  it("puts a new transfer at the top", () => {
    const merged = mergeTransferProgress([transfer("a")], transfer("b"));
    expect(merged.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("updates an existing transfer in place, so two running rows do not swap", () => {
    const first = transfer("a");
    const second = transfer("b");
    const merged = mergeTransferProgress([second, first], transfer("a", 40));

    expect(merged.map((item) => item.id)).toEqual(["b", "a"]);
    expect(merged[1]?.transferred).toBe(40);
  });

  it("drops the oldest row when a new one exceeds the cap", () => {
    const six = Array.from({ length: MAX_TRANSFER_ROWS }, (_, index) => transfer(`old-${index}`));
    const merged = mergeTransferProgress(six, transfer("new"));

    expect(merged).toHaveLength(MAX_TRANSFER_ROWS);
    expect(merged[0]?.id).toBe("new");
    expect(merged.some((item) => item.id === "old-5")).toBe(false);
  });
});
