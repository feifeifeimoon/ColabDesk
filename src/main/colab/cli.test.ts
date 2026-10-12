import { describe, expect, it } from "vitest";
import { combined, needsLogin, parseUsage, parseVersion } from "./cli";

describe("parseUsage", () => {
  it("parses the three labelled lines", () => {
    const usage = parseUsage(
      "Current balance: 123.45 compute units\nUsage rate: 1.20/hr\nActive assignments: 2\n",
    );
    expect(usage).toEqual({ balance: 123.45, rate: 1.2, assignments: 2 });
  });

  it("parses real Windows CRLF output", () => {
    const usage = parseUsage(
      "Current balance: 400.00 compute units\r\nUsage rate: 0.00/hr\r\nActive assignments: 0\r\n",
    );
    expect(usage).toEqual({ balance: 400, rate: 0, assignments: 0 });
  });

  it("leaves fields empty on an unknown format", () => {
    expect(parseUsage("some other output\n")).toEqual({ balance: null, rate: null, assignments: null });
  });
});

describe("needsLogin", () => {
  it("detects the OAuth prompt", () => {
    expect(needsLogin("To authorize colab-cli, visit this URL")).toBe(true);
    expect(needsLogin("https://accounts.google.com/o/oauth2/auth?x=1")).toBe(true);
    expect(needsLogin("Current balance: 0.00 compute units")).toBe(false);
  });
});

describe("parseVersion", () => {
  it("reads the labelled version", () => {
    expect(parseVersion("Version: 0.7.4\n")).toBe("0.7.4");
    expect(parseVersion("no version here")).toBeNull();
  });
});

describe("combined output", () => {
  it("keeps stdout before stderr and skips empty streams", () => {
    expect(combined({ code: 0, stdout: "a\n", stderr: "", timedOut: false })).toBe("a");
    expect(combined({ code: 1, stdout: "", stderr: "boom\n", timedOut: false })).toBe("boom");
    expect(combined({ code: 0, stdout: "out", stderr: "err", timedOut: false })).toBe("out\nerr");
  });
});
