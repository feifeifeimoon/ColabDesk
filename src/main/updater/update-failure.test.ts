import { describe, expect, it } from "vitest";
import { classifyUpdateFailure } from "./update-failure";

describe("classifyUpdateFailure", () => {
  it("recognises the transport failures electron-updater surfaces", () => {
    expect(classifyUpdateFailure("net::ERR_INTERNET_DISCONNECTED")).toBe("network");
    expect(classifyUpdateFailure("net::ERR_NAME_NOT_RESOLVED")).toBe("network");
    expect(classifyUpdateFailure("RequestError: connect ETIMEDOUT 20.205.243.166:443")).toBe("network");
    expect(classifyUpdateFailure("read ECONNRESET")).toBe("network");
  });

  it("separates a release with no up-to-date package from a network problem", () => {
    // Advising "check your proxy" for a published-but-incomplete release sends
    // the user to look at the wrong thing entirely.
    expect(classifyUpdateFailure("HttpError: 404 Not Found")).toBe("missing-release");
    expect(classifyUpdateFailure("Cannot find latest.yml in the latest release")).toBe("missing-release");
  });

  it("recognises a build that has no updater at all", () => {
    expect(classifyUpdateFailure("Cannot find app-update.yml")).toBe("unavailable");
    expect(classifyUpdateFailure("ZIP file not provided")).toBe("unavailable");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(classifyUpdateFailure("something nobody has seen before")).toBe("unknown");
    expect(classifyUpdateFailure("")).toBe("unknown");
  });
});
