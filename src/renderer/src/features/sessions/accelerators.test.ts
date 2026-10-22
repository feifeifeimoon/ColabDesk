import { describe, expect, it } from "vitest";
import { acceleratorKey, acceleratorLabel, sessionRate, sessionRateText } from "./accelerators";

describe("accelerator ids", () => {
  it("folds the picker's spelling and the backend's spelling to one key", () => {
    expect(acceleratorKey("tpu:v5e1")).toBe("TPU V5E1");
    expect(acceleratorKey("V5E1")).toBe("TPU V5E1");
    expect(acceleratorKey("tpu:v6e1")).toBe("TPU V6E1");
    expect(acceleratorKey("NONE")).toBe("CPU");
    expect(acceleratorKey("")).toBe("CPU");
  });

  it("prints the picker's label for a stored session", () => {
    expect(acceleratorLabel("NONE")).toBe("CPU");
    expect(acceleratorLabel("V5E1")).toBe("TPU v5e1");
    expect(acceleratorLabel("V6E1")).toBe("TPU v6e1");
    expect(acceleratorLabel("H100")).toBe("H100");
    expect(acceleratorLabel("")).toBe("CPU");
    expect(acceleratorLabel(undefined)).toBe("CPU");
  });
});

describe("the per-session rate", () => {
  it("prices every machine the picker offers", () => {
    expect(sessionRate("H100", false, null).rate).toBe(18.62);
    expect(sessionRate("G4", false, null).rate).toBe(8.9);
    expect(sessionRate("A100", false, null).rate).toBe(5.3);
    expect(sessionRate("V5E1", false, null).rate).toBe(2.92);
    expect(sessionRate("V6E1", false, null).rate).toBe(4.6);
  });

  it("keeps CPU a real hourly cost", () => {
    expect(sessionRate("NONE", false, null).rate).toBe(0.08);
  });

  it("does not turn an unknown machine into zero", () => {
    const unknown = sessionRate("TPU", false, null);
    expect(unknown.rate).toBeNull();
    expect(sessionRateText(unknown)).toBe("—/h");
  });

  it("uses a measured high-RAM rate rather than a multiplier", () => {
    expect(sessionRate("CPU", true, null).rate).toBe(0.26);
    expect(sessionRate("T4", true, null).rate).toBe(1.27);
    expect(sessionRate("A100", true, null).rate).toBe(6.77);
    expect(sessionRate("H100", true, null).rate).toBe(22.34);
    expect(sessionRate("L4", true, null).rate).toBe(1.54);
    expect(sessionRate("V6E1", true, null).rate).toBe(4.6);
  });

  it("prefers the account's own reading, which already includes the shape", () => {
    const actual = sessionRate("H100", true, 21.5);
    expect(actual).toEqual({ rate: 21.5, actual: true });
    expect(sessionRateText(actual)).toBe("21.50/h");
  });

  it("marks reference values with a tilde", () => {
    expect(sessionRateText(sessionRate("T4", false, null))).toBe("~1.07/h");
  });
});
