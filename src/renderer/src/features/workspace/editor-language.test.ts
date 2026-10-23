import { describe, expect, it } from "vitest";
import { languageForPath } from "./editor-language";

describe("the editor's language map", () => {
  it("mounts a language for the files a runtime actually holds", () => {
    for (const path of [
      "notes.md",
      "notes.markdown",
      "script.py",
      "run.sh",
      "data.json",
      "config.yml",
      "config.yaml",
      "app.tsx",
      "page.html",
      "style.css",
    ]) {
      expect(languageForPath(path), path).not.toBeNull();
    }
  });

  it("leaves plain text and unknown extensions plain", () => {
    expect(languageForPath("train.log")).toBeNull();
    expect(languageForPath("sample.csv")).toBeNull();
    expect(languageForPath("README")).toBeNull();
    expect(languageForPath("dir.with.dots/README")).toBeNull();
    // Inherited Object properties are not languages.
    expect(languageForPath("notes.constructor")).toBeNull();
    expect(languageForPath("notes.__proto__")).toBeNull();
    expect(languageForPath("notes.toString")).toBeNull();
  });

  it("is case-insensitive and handles Windows paths", () => {
    expect(languageForPath("C:\\content\\NOTES.MD")).not.toBeNull();
    expect(languageForPath("/content/SCRIPT.PY")).not.toBeNull();
  });
});
