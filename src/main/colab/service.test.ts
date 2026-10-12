import { describe, expect, it } from "vitest";
import { isTransientNetworkFailure } from "./service";

describe("transient network failures", () => {
  it("recognises the dropped TLS connection seen in practice", () => {
    const real =
      "MaxRetryError: HTTPSConnectionPool(host='colab.research.google.com', port=443): " +
      "Max retries exceeded with url: /tun/m/assignments?authuser=0 (Caused by " +
      "SSLError(SSLEOFError(8, '[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in " +
      "violation of protocol (_ssl.c:1010)')))";
    expect(isTransientNetworkFailure(real)).toBe(true);
  });

  it("does not treat logical failures as retryable", () => {
    expect(
      isTransientNetworkFailure(
        "[colab] Backend rejected accelerator 'A100'. You may not have quota or entitlement",
      ),
    ).toBe(false);
    expect(isTransientNetworkFailure("[colab] Allocation refused (precondition failed).")).toBe(false);
    expect(isTransientNetworkFailure("")).toBe(false);
  });
});
