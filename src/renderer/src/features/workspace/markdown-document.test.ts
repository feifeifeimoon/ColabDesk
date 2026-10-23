import { describe, expect, it } from "vitest";
import { hasFrontMatter } from "./markdown-document";

describe("the Markdown document's front matter", () => {
  it("recognises a closed YAML block at the very top", () => {
    expect(hasFrontMatter("---\ntitle: Guide\n---\n# Body\n")).toBe(true);
    expect(hasFrontMatter("---\r\ntitle: Guide\r\n---\r\n# Body\r\n")).toBe(true);
  });

  it("does not take a horizontal rule for front matter", () => {
    expect(hasFrontMatter("---\n\n# Body\n")).toBe(false);
    // Only the opening fence: the document is still a normal note.
    expect(hasFrontMatter("---\ntitle: Guide\n# Body\n")).toBe(false);
  });

  it("requires the fence to open the document", () => {
    expect(hasFrontMatter("\n---\ntitle: Guide\n---\n")).toBe(false);
    expect(hasFrontMatter("# Body\n\n---\ntitle: Guide\n---\n")).toBe(false);
  });
});
