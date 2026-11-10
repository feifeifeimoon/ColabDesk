import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildBlog, parseFrontMatter, readingMinutes, slugify } from "./build-site-blog.mjs";

const roots = [];

function makeRoot(posts) {
  const root = mkdtempSync(join(tmpdir(), "colabdesk-blog-"));
  roots.push(root);
  mkdirSync(join(root, "blog", "posts"), { recursive: true });
  mkdirSync(join(root, "site"), { recursive: true });
  for (const [file, content] of Object.entries(posts)) {
    writeFileSync(join(root, "blog", "posts", file), content, "utf8");
  }
  return root;
}

function read(root, relative) {
  return readFileSync(join(root, "site", relative), "utf8");
}

const EN = `---
title: Hello
description: First post
date: 2026-01-02
tags: [alpha, beta]
---

## Section

Body with a [link](https://example.com) and \`code\`.
`;

const ZH = `---
title: 你好
description: 第一篇
date: 2026-01-02
tags: [甲]
---

## 小节

正文。
`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("parseFrontMatter", () => {
  it("reads strings, arrays and booleans", () => {
    const { data, body } = parseFrontMatter(
      '---\ntitle: "Hello: world"\ndraft: true\ntags: [one, "two words"]\n---\n\nBody\n',
    );
    expect(data.title).toBe("Hello: world");
    expect(data.draft).toBe(true);
    expect(data.tags).toEqual(["one", "two words"]);
    expect(body).toBe("\nBody\n");
  });

  it("rejects a file without front matter", () => {
    expect(() => parseFrontMatter("# no front matter")).toThrow(/front matter/);
  });
});

describe("slugify", () => {
  it("keeps words and drops punctuation", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("keeps CJK characters", () => {
    expect(slugify("你好，世界")).toBe("你好-世界");
  });
});

describe("readingMinutes", () => {
  it("never reports less than a minute", () => {
    expect(readingMinutes("Short.")).toBe(1);
  });

  it("counts CJK characters and Latin words separately", () => {
    expect(readingMinutes("中".repeat(400))).toBe(1);
    expect(readingMinutes("中".repeat(800))).toBe(2);
    expect(readingMinutes(Array.from({ length: 400 }, () => "word").join(" "))).toBe(2);
  });

  it("ignores fenced code and links", () => {
    const body = ["```bash", "x".repeat(4000), "```", "[link](https://example.com)"].join("\n");
    expect(readingMinutes(body)).toBe(1);
  });
});

describe("buildBlog", () => {
  it("writes both language indexes, both articles, feeds and a sitemap", () => {
    const root = makeRoot({ "hello.en.md": EN, "hello.zh.md": ZH });
    const result = buildBlog({ root });

    expect(result.generated).toEqual([
      "blog/feed.xml",
      "blog/hello/index.html",
      "blog/index.html",
      "blog/zh/feed.xml",
      "blog/zh/hello/index.html",
      "blog/zh/index.html",
      "sitemap.xml",
    ]);

    const enIndex = read(root, "blog/index.html");
    expect(enIndex).toContain('href="/blog/hello/"');
    expect(enIndex).toContain("Hello");

    const zhIndex = read(root, "blog/zh/index.html");
    expect(zhIndex).toContain('href="/blog/zh/hello/"');
    expect(zhIndex).toContain("你好");

    const article = read(root, "blog/hello/index.html");
    expect(article).toContain('<html lang="en">');
    expect(article).toContain('<h1 class="post__title">Hello</h1>');
    expect(article).toContain('<h2 id="section">Section</h2>');
    expect(article).toContain('hreflang="zh-CN"');
    expect(article).toContain('href="/blog/zh/hello/"');

    expect(read(root, "sitemap.xml")).toContain("https://colabdesk.dev/blog/zh/hello/");
    expect(read(root, "blog/feed.xml")).toContain("<title>Hello</title>");
    expect(read(root, "blog/zh/feed.xml")).toContain("<title>你好</title>");
  });

  it("renders the masthead with the current section and language", () => {
    const root = makeRoot({ "hello.en.md": EN, "hello.zh.md": ZH });
    buildBlog({ root });

    const article = read(root, "blog/hello/index.html");
    expect(article).toContain('class="blog-nav"');
    expect(article).toContain('class="lang-switch"');
    expect(article).toContain('aria-current="page">EN</span>');
    expect(article).toContain('href="/blog/zh/hello/"');

    const index = read(root, "blog/index.html");
    expect(index).toContain('class="blog-nav__section" href="/blog/" aria-current="page"');

    const zhArticle = read(root, "blog/zh/hello/index.html");
    expect(zhArticle).toContain('aria-current="page">中文</span>');
  });

  it("renders a cover, byline, highlighted code, captions and a mobile TOC", () => {
    const post = `---
title: With assets
description: Assets
date: 2026-01-04
category: Tutorial
cover: /assets/blog/x/cover.png
---

This is the intro.

| Column | Value |
| --- | --- |
| One | 1 |

---

## One

Text.

## Two

Text.

\`\`\`bash
ls -la
\`\`\`

## Three

![Diagram](/assets/blog/x/diagram.png)
`;
    const other = `---
title: Another post
description: Another
date: 2026-01-03
---

## Only
`;
    const root = makeRoot({ "assets.en.md": post, "other.en.md": other });
    mkdirSync(join(root, "site", "assets", "blog", "x"), { recursive: true });
    writeFileSync(join(root, "site", "assets", "blog", "x", "cover.png"), "png");

    buildBlog({ root });
    const html = read(root, "blog/assets/index.html");

    expect(html).toContain('class="post__category"');
    expect(html).toContain("Tutorial");
    expect(html).toContain('class="post__byline"');
    expect(html).toContain("min read");
    expect(html).toContain('class="post-toc"');
    expect(html).toContain('class="post-toc-mobile"');
    expect(html).toContain('href="#one"');
    expect(html).toContain('href="#two"');
    expect(html).toContain('href="#three"');
    expect(html).toContain('class="post__cover"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('content="summary_large_image"');
    expect(html).toContain('<div class="table-scroll"><table>');
    expect(html).toContain('data-label="Column"');
    expect(html.indexOf('class="post__cover"')).toBeGreaterThan(html.indexOf("This is the intro."));
    expect(html.indexOf('class="post__cover"')).toBeLessThan(html.indexOf("<hr>"));
    expect(html).toContain('class="code-block" data-language="bash"');
    expect(html).toContain("hljs-built_in");
    expect(html).toContain('<figure class="post__figure">');
    expect(html).toContain("<figcaption>Diagram</figcaption>");
    expect(html).toContain('class="post__related"');
    expect(html).toContain("Another post");
  });

  it("fails when a cover is declared but the file is missing", () => {
    const post = "---\ntitle: Missing\ndescription: Missing\ndate: 2026-01-04\ncover: /assets/blog/x/none.png\n---\n\nBody\n";
    const root = makeRoot({ "missing.en.md": post });
    expect(() => buildBlog({ root })).toThrow(/cover not found/);
  });

  it("lists a single-language post in the other index with a language badge", () => {
    const root = makeRoot({ "only-zh.zh.md": ZH });
    buildBlog({ root });

    const enIndex = read(root, "blog/index.html");
    expect(enIndex).toContain('href="/blog/zh/only-zh/"');
    expect(enIndex).toContain('class="post-list__language"');
    expect(existsSync(join(root, "site", "blog", "only-zh", "index.html"))).toBe(false);
  });

  it("keeps generated HTML inside the CSP: two external scripts, no inline handlers or styles", () => {
    const root = makeRoot({ "hello.en.md": EN });
    buildBlog({ root });

    for (const relative of ["blog/index.html", "blog/hello/index.html"]) {
      const html = read(root, relative);
      expect(html.match(/<script\b[^>]*>/gi) ?? []).toEqual([
        '<script src="/theme.js">',
        '<script src="/blog/blog.js" defer>',
      ]);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/\sstyle\s*=/i);
    }
  });

  it("rejects raw script markup in a post", () => {
    const root = makeRoot({
      "bad.en.md": "---\ntitle: Bad\ndescription: Bad\ndate: 2026-01-02\n---\n\n<script>alert(1)</script>\n",
    });
    expect(() => buildBlog({ root })).toThrow(/script/i);
  });

  it("rejects a missing or impossible date", () => {
    const root = makeRoot({
      "bad.en.md": "---\ntitle: Bad\ndescription: Bad\ndate: 2026-02-30\n---\n\nBody\n",
    });
    expect(() => buildBlog({ root })).toThrow(/date/);
  });

  it("drops drafts unless asked for them", () => {
    const draft = "---\ntitle: Draft\ndescription: Draft\ndate: 2026-01-03\ndraft: true\n---\n\nBody\n";
    const root = makeRoot({ "hello.en.md": EN, "draft.en.md": draft });

    buildBlog({ root });
    expect(existsSync(join(root, "site", "blog", "draft", "index.html"))).toBe(false);

    buildBlog({ root, includeDrafts: true });
    expect(existsSync(join(root, "site", "blog", "draft", "index.html"))).toBe(true);
  });

  it("removes the output of a post that no longer exists", () => {
    const root = makeRoot({ "hello.en.md": EN, "gone.en.md": EN.replace("Hello", "Gone") });
    buildBlog({ root });
    expect(existsSync(join(root, "site", "blog", "gone", "index.html"))).toBe(true);

    rmSync(join(root, "blog", "posts", "gone.en.md"));
    buildBlog({ root });
    expect(existsSync(join(root, "site", "blog", "gone", "index.html"))).toBe(false);
  });

  it("checks the committed output against the sources", () => {
    const root = makeRoot({ "hello.en.md": EN });
    buildBlog({ root });

    expect(buildBlog({ root, check: true }).differences).toEqual([]);

    writeFileSync(join(root, "blog", "posts", "hello.en.md"), EN.replace("Hello", "Changed"), "utf8");
    expect(buildBlog({ root, check: true }).differences).toContain("changed: blog/hello/index.html");
  });
});
