/**
 * The star ask has to survive not having anywhere to remember itself.
 *
 * This matters because it is read while the start page draws, and the unit tests
 * run in node — where `localStorage` does not exist at all. A missing store is a
 * missing preference, not a broken page.
 */

import { describe, expect, it, vi } from "vitest";
import { REPOSITORY_URL, hasOpenedRepository, rememberRepositoryOpened } from "./star-prompt";

describe("the star ask", () => {
  it("counts as unanswered, and remembers nothing, without storage", () => {
    expect(hasOpenedRepository()).toBe(false);
    expect(() => rememberRepositoryOpened()).not.toThrow();
  });

  it("remembers that the repository has been opened", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
    });

    expect(hasOpenedRepository()).toBe(false);
    rememberRepositoryOpened();
    expect(hasOpenedRepository()).toBe(true);

    vi.unstubAllGlobals();
  });

  it("points at the project's repository", () => {
    expect(REPOSITORY_URL).toBe("https://github.com/feifeifeimoon/ColabDesk");
  });
});
