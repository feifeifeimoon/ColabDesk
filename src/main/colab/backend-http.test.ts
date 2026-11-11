import { afterEach, describe, expect, it } from "vitest";

import { httpFetch, setHttpTransport } from "./backend-http";

describe("the Colab HTTP transport", () => {
  afterEach(() => setHttpTransport(globalThis.fetch));

  it("uses the installed transport", async () => {
    setHttpTransport(async () => new Response("ok", { status: 200 }));

    const response = await httpFetch("https://example.com/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
