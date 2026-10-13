import { describe, expect, it } from "vitest";
import { extractUrl } from "./login";

describe("extractUrl", () => {
  it("extracts Google accounts authorization URL", () => {
    const url = "https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=123";
    expect(extractUrl(url)).toBe(url);
    expect(extractUrl(`  ${url}  `)).toBe(url);
  });

  it("returns null for non-Google URLs or normal messages", () => {
    expect(extractUrl("To authorize colab-cli, visit this URL:")).toBeNull();
    expect(extractUrl("https://colab.research.google.com")).toBeNull();
    expect(extractUrl("Current balance: 100")).toBeNull();
    expect(extractUrl("")).toBeNull();
  });
});
