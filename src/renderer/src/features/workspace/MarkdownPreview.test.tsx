import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

describe("the Markdown preview", () => {
  it("renders GFM, code fences and links without raw HTML", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownPreview, {
        text: [
          "# Guide",
          "",
          "This is **bold** and [a link](https://colabdesk.dev).",
          "",
          "| a | b |",
          "| - | - |",
          "| 1 | 2 |",
          "",
          "```python",
          "print(1)",
          "```",
          "",
          "<script>alert(1)</script>",
        ].join("\n"),
      }),
    );

    expect(html).toContain("<h1>Guide</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://colabdesk.dev"');
    expect(html).toContain("<table>");
    expect(html).toContain('class="language-python"');
    // Raw HTML is text, never an element: the preview reads files this window
    // has never seen.
    expect(html).not.toContain("<script>");
  });

  it("keeps local links inert instead of giving them an href", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownPreview, {
        text: [
          "[relative](./other.md)",
          "[file](file:///etc/passwd)",
          "[external](https://colabdesk.dev)",
          "[mail](mailto:hello@colabdesk.dev)",
        ].join("\n\n"),
      }),
    );

    expect(html).not.toContain('href="./other.md"');
    expect(html).not.toContain("href=\"file:");
    expect(html).toContain('href="https://colabdesk.dev"');
    expect(html).toContain('href="mailto:hello@colabdesk.dev"');
  });
});
