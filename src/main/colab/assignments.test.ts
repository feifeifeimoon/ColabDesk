import { describe, expect, it } from "vitest";
import { parseAssignments } from "./assignments";

/**
 * A live `/tun/m/assignments` body, verbatim: the XSSI guard already stripped,
 * the enums still as the ints the backend sends, and a `runtimeProxyInfo` this
 * app reads only the URL out of.
 */
const REAL_BODY = {
  assignments: [
    {
      endpoint: "m-s-kkb-usc1c1-1ysqo4pb8zt5n",
      variant: 0,
      machineShape: 0,
      accelerator: "NONE",
      runtimeProxyInfo: {
        token: "eyJhbGciOiJFUzI1NiJ9.payload.signature",
        tokenExpiresInSeconds: 3600,
        url: "https://8080-m-s-kkb-usc1c1-1ysqo4pb8zt5n-c.us-central1-1.prod.colab.dev",
      },
    },
  ],
};

describe("assignments", () => {
  it("reads the int enums as the names sessions.json holds", () => {
    const assignments = parseAssignments({
      assignments: [
        { endpoint: "gpu-t4-a", variant: 1, machineShape: 1, accelerator: "T4" },
        { endpoint: "tpu-v5e1-b", variant: 2, machineShape: 0, accelerator: "V5E1" },
      ],
    });
    expect(assignments?.map((assignment) => assignment.variant)).toEqual(["GPU", "TPU"]);
    expect(assignments?.[0].machine_shape).toBe("HIGH_RAM");
    expect(assignments?.[1].machine_shape).toBe("STANDARD");
  });

  it("carries the endpoint, accelerator and runtime URL through", () => {
    const assignments = parseAssignments(REAL_BODY);
    expect(assignments).toHaveLength(1);
    expect(assignments?.[0]).toEqual({
      endpoint: "m-s-kkb-usc1c1-1ysqo4pb8zt5n",
      variant: "DEFAULT",
      accelerator: "NONE",
      machine_shape: "STANDARD",
      url: "https://8080-m-s-kkb-usc1c1-1ysqo4pb8zt5n-c.us-central1-1.prod.colab.dev",
    });
  });

  it("reads an account with nothing allocated as no runtimes, not as unknown", () => {
    expect(parseAssignments({ assignments: [] })).toEqual([]);
  });

  it("answers null when this is not that response", () => {
    expect(parseAssignments(null)).toBeNull();
    expect(parseAssignments("not an object")).toBeNull();
    expect(parseAssignments({})).toBeNull();
    expect(parseAssignments({ assignments: { endpoint: "x" } })).toBeNull();
  });

  it("skips an entry with no endpoint rather than dropping the whole list", () => {
    const assignments = parseAssignments({
      assignments: [{ variant: 0 }, ...REAL_BODY.assignments],
    });
    expect(assignments?.map((assignment) => assignment.endpoint)).toEqual([
      "m-s-kkb-usc1c1-1ysqo4pb8zt5n",
    ]);
  });

  it("keeps a runtime whose display fields are missing or unrecognised", () => {
    const assignments = parseAssignments({ assignments: [{ endpoint: "m-s-kkb-1" }] });
    expect(assignments?.[0]).toEqual({
      endpoint: "m-s-kkb-1",
      variant: "DEFAULT",
      accelerator: "NONE",
      machine_shape: "STANDARD",
      url: "",
    });
    // A variant this app has never seen is still a runtime that is running.
    expect(parseAssignments({ assignments: [{ endpoint: "x", variant: 9 }] })?.[0].variant).toBe("DEFAULT");
  });
});
