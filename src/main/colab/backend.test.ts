import { describe, expect, it } from "vitest";
import { stripXssiPrefix } from "./backend";

/**
 * Measured against the live backend: every JSON body arrives with the guard,
 * and `JSON.parse` fails on all of it without this. The CLI does the same thing
 * in `Client._strip_xssi_prefix`.
 */
describe("the backend's XSSI guard", () => {
  it("takes the prefix off a guarded body", () => {
    expect(stripXssiPrefix(")]}'\n{\"assignments\":[]}")).toBe("\n{\"assignments\":[]}");
    expect(JSON.parse(stripXssiPrefix(")]}'{\"assignmentsCount\":1}"))).toEqual({ assignmentsCount: 1 });
  });

  it("leaves an unguarded body alone", () => {
    expect(stripXssiPrefix("{\"assignments\":[]}")).toBe("{\"assignments\":[]}");
    expect(stripXssiPrefix("")).toBe("");
  });

  it("only strips the guard, not the same characters elsewhere", () => {
    expect(stripXssiPrefix("{\"note\":\")]}'\",\"assignments\":[]}")).toBe("{\"note\":\")]}'\",\"assignments\":[]}");
  });
});
