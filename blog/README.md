# Blog sources

The blog is Markdown here, static HTML in `site/blog/`. The deployed site needs
no build step; the generator runs on a contributor's machine and its output is
committed.

## Add a post

1. Create `posts/<slug>.<lang>.md` — `<slug>` is kebab-case, `<lang>` is `en`
   or `zh`. Both languages are optional; write the second file when you have it.
2. Start the file with front matter:

```markdown
---
title: A short, specific title
description: One sentence for the index, the meta tag and the feed.
date: 2026-11-10
category: Tutorial         # optional; the pill above the title
updated: 2026-11-10        # optional
tags: [tutorial, comfyui]  # optional
cover: /assets/blog/<slug>/cover.png  # optional, must exist under site/
draft: true                # optional; drafts are skipped unless --drafts
---
```

3. Write the body in normal Markdown (GFM tables, fenced code blocks, lists,
   quotes, links, images). Do **not** start with an `#` heading: the title comes
   from the front matter and is rendered as the article's `<h1>`.
4. Generate and check:

```bash
npm run site:blog        # writes site/blog/ and site/sitemap.xml
npm run site:blog:check  # fails if the committed output is stale
```

5. Preview locally:

```bash
npx wrangler dev
# http://127.0.0.1:8787/blog/ and /blog/zh/
```

6. Commit `blog/posts/`, `blog/.manifest.json`, and the generated files under
   `site/blog/` plus `site/sitemap.xml`.

## Rules

- **Do not edit `site/blog/index.html`, `site/blog/zh/`, or the article
  directories by hand.** They are generated; the next build overwrites them.
- **Assets are absolute.** Use `/assets/blog/<slug>/photo.png` and put the file
  under `site/assets/blog/<slug>/`. A relative path resolves against the
  article URL (`/blog/<slug>/`), not the site root. Covers are 1200×630; the
  article body displays images at the reading-column width.
- **The sidebar table of contents is automatic.** The generator collects `h2`
  and `h3` headings, gives them ids, and renders the sticky "On this page" list
  beside the article. No markup is needed in the post; keep headings short
  enough to read in a 200px column.
- **No raw HTML that the CSP would block.** The generator refuses `<script>`,
  inline event handlers (`onclick=`) and inline `style=` attributes. Code
  examples that show such markup belong inside fenced code blocks.
- **The blog is static per language.** The language switch links to the other
  URL; it does not use `localStorage`. A post in one language is listed in both
  indexes with a language badge.
- **The index sorts by `date`, newest first.** A post without a valid
  `YYYY-MM-DD` date (or without a title or description) fails the build.

## Files

```
blog/
  posts/            Markdown sources
  .manifest.json    generated; lets a rebuild delete removed posts
tools/
  build-site-blog.mjs        the generator
  build-site-blog.test.mjs   front matter, output, CSP and --check tests
site/
  blog/blog.css     hand-written; not generated
  blog/**/          generated HTML, feeds
  sitemap.xml       generated
```
