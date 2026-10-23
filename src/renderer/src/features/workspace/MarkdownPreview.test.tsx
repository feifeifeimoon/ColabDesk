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
});
