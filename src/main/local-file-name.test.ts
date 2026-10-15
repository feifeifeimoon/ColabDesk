import { describe, expect, it } from "vitest";
import { sanitizeLocalName } from "./local-file-name";

describe("sanitizeLocalName", () => {
  it("replaces the characters Windows refuses", () => {
    expect(sanitizeLocalName("best:1.pt")).toBe("best-1.pt");
    expect(sanitizeLocalName('a*b?"c.txt')).toBe("a-b--c.txt");
    expect(sanitizeLocalName("dir/name.txt")).toBe("dir-name.txt");
  });

  it("drops the trailing dots and spaces Windows would drop for us", () => {
    expect(sanitizeLocalName("notes.txt.")).toBe("notes.txt");
    expect(sanitizeLocalName("notes.txt   ")).toBe("notes.txt");
    expect(sanitizeLocalName(".")).toBe("download");
  });

  it("keeps device names from being reserved", () => {
    expect(sanitizeLocalName("CON")).toBe("_CON");
    expect(sanitizeLocalName("nul.txt")).toBe("_nul.txt");
    // Only the reserved spelling is prefixed; `console.log` is an ordinary name.
    expect(sanitizeLocalName("console.log")).toBe("console.log");
  });

  it("keeps a long name inside the length budget without losing its extension", () => {
    const long = `${"a".repeat(400)}.pt`;
    const result = sanitizeLocalName(long);
    expect(result.length).toBe(160);
    expect(result.endsWith(".pt")).toBe(true);
  });

  it("leaves an ordinary name alone", () => {
    expect(sanitizeLocalName("sample.csv")).toBe("sample.csv");
  });
});
