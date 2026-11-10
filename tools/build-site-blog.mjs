/**
 * Turns `blog/posts/*.md` into the static pages under `site/blog/`.
 *
 * The site itself has no build step: it is a directory of files that
 * `wrangler deploy` uploads as-is. This script keeps that true — it runs on a
 * contributor's machine (or in CI as `--check`) and the committed output is
 * what ships. Authoring in Markdown is worth one local command; serving
 * Markdown from the browser would cost the article's first paint and its
 * search indexing, and the site's CSP has no inline-script hole to do it with.
 *
 * A post is `<slug>.<lang>.md` with `<slug>` kebab-case and `<lang>` `en` or
 * `zh`. Both languages are optional; a post that exists in one language is
 * listed in both indexes and marked with the language it was written in.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import { marked } from "marked";

for (const [name, language] of Object.entries({ bash, ini, javascript, json, python, typescript, yaml })) {
  hljs.registerLanguage(name, language);
}

const ROOT = resolve(import.meta.dirname, "..");
const SITE_ORIGIN = "https://colabdesk.dev";
const LANGS = ["en", "zh"];
const POST_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(en|zh)\.md$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const LABELS = {
  en: {
    htmlLang: "en",
    hreflang: "en",
    dateLocale: "en-US",
    blog: "Blog",
    intro: "Notes, walkthroughs, and field reports from the ColabDesk workbench.",
    back: "All posts",
    switchLanguage: "中文",
    navBlog: "Blog",
    footerTagline: "A desktop SSH console for Google Colab runtimes.",
    footerProduct: "Product",
    footerDownload: "Download",
    footerReleases: "Releases",
    footerResources: "Resources",
    footerReadme: "README",
    footerLicense: "License",
    footerGithub: "GitHub",
    footerRights: "© ColabDesk · Apache-2.0",
    footerUnofficial: "Unofficial, not affiliated with Google. Colab is a trademark of Google LLC.",
    feedTitle: "ColabDesk Blog",
    feedDescription: "Notes, walkthroughs, and field reports from the ColabDesk workbench.",
    tag: "Tags",
    onThisPage: "On this page",
    languageGroup: "Language",
    author: "ColabDesk Team",
    moreFromBlog: "More from the blog",
    readingTime: (minutes) => `${minutes} min read`,
  },
  zh: {
    htmlLang: "zh-CN",
    hreflang: "zh-CN",
    dateLocale: "zh-CN",
    blog: "博客",
    intro: "来自 ColabDesk 工作台的实践笔记、教程与踩坑记录。",
    back: "全部文章",
    switchLanguage: "English",
    navBlog: "博客",
    footerTagline: "Google Colab 运行时的桌面 SSH 控制台。",
    footerProduct: "产品",
    footerDownload: "下载",
    footerReleases: "版本发布",
    footerResources: "资源",
    footerReadme: "说明文档",
    footerLicense: "许可证",
    footerGithub: "GitHub",
    footerRights: "© ColabDesk · Apache-2.0",
    footerUnofficial: "非官方产品，与 Google 无关。Colab 是 Google LLC 的商标。",
    feedTitle: "ColabDesk 博客",
    feedDescription: "来自 ColabDesk 工作台的实践笔记、教程与踩坑记录。",
    tag: "标签",
    onThisPage: "目录",
    languageGroup: "语言",
    author: "ColabDesk 团队",
    moreFromBlog: "更多文章",
    readingTime: (minutes) => `${minutes} 分钟阅读`,
  },
};

// ---------------------------------------------------------------------------
// Front matter and text helpers
// ---------------------------------------------------------------------------

export function parseFrontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error("missing front matter (--- ... ---)");

  const data = {};
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`front matter line has no key: ${line}`);
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(iso, lang) {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(LABELS[lang].dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * A reading estimate good enough for a byline: CJK characters at ~400/min,
 * Latin words at ~200/min, with fenced code and links removed first so a page
 * of shell commands does not inflate it.
 */
export function readingMinutes(body) {
  const plain = String(body)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ");
  const cjk = (plain.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (plain.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9][A-Za-z0-9'’._-]*/g) ?? []).length;
  return Math.max(1, Math.ceil(cjk / 400 + words / 200));
}

/** Turns a paragraph containing only an image into a figure with its alt text as the caption. */
function captionFigures(html) {
  return html.replace(/<p><img ([^>]*?)><\/p>/g, (match, attributes) => {
    const alt = /alt="([^"]*)"/.exec(attributes)?.[1];
    if (!alt) return match;
    return `<figure class="post__figure"><img ${attributes}><figcaption>${alt}</figcaption></figure>`;
  });
}

// Fenced code is highlighted at build time; the site ships classes, not a
// highlighter. An unknown language is escaped and left plain.
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? "").trim().split(/\s+/)[0].replace(/[^A-Za-z0-9_+-]/g, "");
      const highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : escapeHtml(text);
      const attribute = language ? ` data-language="${escapeHtml(language)}"` : "";
      return `<div class="code-block"${attribute}><pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
  },
});

function assertDate(value, where) {
  if (!DATE.test(value)) throw new Error(`${where}: date must be YYYY-MM-DD, got "${value}"`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${where}: date is not a real day: "${value}"`);
  }
}

/** Adds stable ids to h2–h4 and returns the headings the sidebar needs. */
function addHeadingIds(html) {
  const used = new Set();
  const headings = [];
  const withIds = html.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_match, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").replace(/&[#\w]+;/g, " ").trim();
    const base = slugify(text) || "section";
    let id = base;
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
    used.add(id);
    headings.push({ level: Number(level), text, id });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: withIds, headings };
}

/** The CSP has no inline-script or inline-style hole; refuse to emit either. */
function assertSafeHtml(html, where) {
  if (/<script\b/i.test(html)) throw new Error(`${where}: <script> is not allowed in a post`);
  if (/\son[a-z]+\s*=/i.test(html)) throw new Error(`${where}: inline event handlers are not allowed`);
  if (/\sstyle\s*=/i.test(html)) throw new Error(`${where}: inline styles are not allowed`);
  if (/javascript:/i.test(html)) throw new Error(`${where}: javascript: URLs are not allowed`);
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

function readPosts(postsDir, { includeDrafts }) {
  if (!existsSync(postsDir)) throw new Error(`no posts directory at ${postsDir}`);
  const groups = new Map();

  for (const file of readdirSync(postsDir).sort()) {
    if (!file.endsWith(".md")) continue;
    const match = POST_FILE.exec(file);
    if (!match) {
      throw new Error(`unrecognised post filename "${file}" (expected <slug>.<en|zh>.md)`);
    }
    const [, slug, lang] = match;
    const where = `blog/posts/${file}`;
    const source = readFileSync(join(postsDir, file), "utf8");
    const { data, body } = parseFrontMatter(source);

    if (!data.title || typeof data.title !== "string") throw new Error(`${where}: title is required`);
    if (!data.description || typeof data.description !== "string") {
      throw new Error(`${where}: description is required`);
    }
    if (!data.date || typeof data.date !== "string") throw new Error(`${where}: date is required`);
    assertDate(data.date, where);
    if (data.updated) assertDate(String(data.updated), where);
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const draft = data.draft === true;
    if (draft && !includeDrafts) continue;

    const post = {
      slug,
      lang,
      title: data.title,
      description: data.description,
      date: data.date,
      updated: data.updated || data.date,
      category: typeof data.category === "string" && data.category ? data.category : null,
      tags,
      cover: typeof data.cover === "string" && data.cover ? data.cover : null,
      draft,
      body,
      source: where,
    };

    const group = groups.get(slug) ?? { slug, posts: {} };
    if (group.posts[lang]) throw new Error(`${where}: duplicate ${lang} post for "${slug}"`);
    group.posts[lang] = post;
    groups.set(slug, group);
  }

  return [...groups.values()]
    .map((group) => ({
      slug: group.slug,
      posts: group.posts,
      date: LANGS.map((lang) => group.posts[lang]?.date).filter(Boolean).sort().at(-1),
    }))
    .sort((left, right) => right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug));
}

function postPath(slug, lang) {
  return lang === "zh" ? `/blog/zh/${slug}/` : `/blog/${slug}/`;
}

function indexPath(lang) {
  return lang === "zh" ? "/blog/zh/" : "/blog/";
}

function feedPath(lang) {
  return lang === "zh" ? "/blog/zh/feed.xml" : "/blog/feed.xml";
}

function absolute(path) {
  return new URL(path, SITE_ORIGIN).href;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function renderHead({ lang, title, description, canonical, alternates = [], cover = null, feed, type = "website" }) {
  const labels = LABELS[lang];
  const alternateLinks = alternates
    .map((item) => `<link rel="alternate" hreflang="${item.hreflang}" href="${escapeHtml(item.href)}">`)
    .join("\n    ");
  const ogImage = cover
    ? `
    <meta property="og:image" content="${escapeHtml(absolute(cover))}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${escapeHtml(title)}">`
    : "";
  const twitterCard = cover ? "summary_large_image" : "summary";

  return `<!doctype html>
<html lang="${labels.htmlLang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    ${alternateLinks}
    <meta property="og:type" content="${type}">
    <meta property="og:site_name" content="ColabDesk">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta name="twitter:card" content="${twitterCard}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">${ogImage}
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/assets/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(LABELS[lang].feedTitle)}" href="${feed}">
    <link rel="preload" href="/assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
    <script src="/theme.js"></script>
    <script src="/blog/blog.js" defer></script>
    <link rel="stylesheet" href="/tokens.css">
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/blog/blog.css">
  </head>`;
}

function renderNav({ lang, alternateHref, current }) {
  const labels = LABELS[lang];
  const sectionCurrent = current === "index" ? ' aria-current="page"' : "";
  const languageOptions =
    lang === "zh"
      ? `<span class="lang-switch__option" lang="zh-Hans" aria-current="page">中文</span>
            <a class="lang-switch__option" href="${escapeHtml(alternateHref)}" hreflang="en" lang="en">EN</a>`
      : `<a class="lang-switch__option" href="${escapeHtml(alternateHref)}" hreflang="zh-CN" lang="zh-Hans">中文</a>
            <span class="lang-switch__option" lang="en" aria-current="page">EN</span>`;

  return `<header class="blog-nav">
      <div class="blog-nav__inner">
        <div class="blog-nav__left">
          <a class="blog-nav__brand" href="/" aria-label="ColabDesk">
            <img class="blog-nav__lockup only-light" src="/assets/lockup.svg" alt="ColabDesk" width="125" height="24">
            <img class="blog-nav__lockup only-dark" src="/assets/lockup-white.svg" alt="ColabDesk" width="125" height="24">
          </a>
          <span class="blog-nav__divider" aria-hidden="true"></span>
          <a class="blog-nav__section" href="${indexPath(lang)}"${sectionCurrent}>${labels.navBlog}</a>
        </div>
        <div class="blog-nav__actions">
          <a class="blog-nav__github" href="https://github.com/feifeifeimoon/ColabDesk" target="_blank" rel="noreferrer" aria-label="ColabDesk on GitHub">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
            <span class="blog-nav__github-label">GitHub</span>
          </a>
          <div class="lang-switch" role="group" aria-label="${labels.languageGroup}">
            <svg class="lang-switch__globe" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
              <circle cx="8" cy="8" r="6.1" />
              <path d="M1.9 8h12.2M8 1.9c1.9 1.9 1.9 10.3 0 12.2M8 1.9c-1.9 1.9-1.9 10.3 0 12.2" />
            </svg>
            ${languageOptions}
          </div>
        </div>
      </div>
    </header>`;
}

function renderFooter(lang) {
  const labels = LABELS[lang];
  return `<footer class="footer">
      <div class="footer__main">
        <div class="footer__brand">
          <a class="footer__brand-link" href="/" aria-label="ColabDesk">
            <img class="footer__lockup only-light" src="/assets/lockup.svg" alt="ColabDesk" width="125" height="24">
            <img class="footer__lockup only-dark" src="/assets/lockup-white.svg" alt="ColabDesk" width="125" height="24">
          </a>
          <p class="footer__tagline">${labels.footerTagline}</p>
        </div>
        <nav class="footer__group" aria-label="${labels.footerProduct}">
          <h2 class="footer__heading">${labels.footerProduct}</h2>
          <ul class="footer__list">
            <li><a href="${indexPath(lang)}">${labels.navBlog}</a></li>
            <li><a href="https://github.com/feifeifeimoon/ColabDesk/releases/latest" target="_blank" rel="noreferrer">${labels.footerDownload}</a></li>
            <li><a href="https://github.com/feifeifeimoon/ColabDesk/releases" target="_blank" rel="noreferrer">${labels.footerReleases}</a></li>
          </ul>
        </nav>
        <nav class="footer__group" aria-label="${labels.footerResources}">
          <h2 class="footer__heading">${labels.footerResources}</h2>
          <ul class="footer__list">
            <li><a href="https://github.com/feifeifeimoon/ColabDesk/blob/main/README.md" target="_blank" rel="noreferrer">${labels.footerReadme}</a></li>
            <li><a href="https://github.com/feifeifeimoon/ColabDesk/blob/main/LICENSE" target="_blank" rel="noreferrer">${labels.footerLicense}</a></li>
            <li><a href="https://github.com/feifeifeimoon/ColabDesk" target="_blank" rel="noreferrer">${labels.footerGithub}</a></li>
          </ul>
        </nav>
      </div>
      <div class="footer__bottom">
        <span>${labels.footerRights}</span>
        <span>${labels.footerUnofficial}</span>
      </div>
    </footer>`;
}

function renderArticle(group, post, groups) {
  const lang = post.lang;
  const labels = LABELS[lang];
  const other = LANGS.find((candidate) => candidate !== lang);
  const alternate = group.posts[other];
  const alternates = LANGS.filter((candidate) => group.posts[candidate]).map((candidate) => ({
    hreflang: LABELS[candidate].hreflang,
    href: absolute(postPath(group.slug, candidate)),
  }));
  if (alternates.length > 1) {
    alternates.push({ hreflang: "x-default", href: absolute(postPath(group.slug, "en")) });
  }

  const { html: withIds, headings } = addHeadingIds(marked.parse(post.body, { gfm: true }));
  const content = captionFigures(withIds);
  assertSafeHtml(content, post.source);
  const minutes = readingMinutes(post.body);

  const tags = post.tags.length
    ? `<ul class="tag-list" aria-label="${labels.tag}">${post.tags
        .map((tag) => `<li>${escapeHtml(tag)}</li>`)
        .join("")}</ul>`
    : "";

  const tocItems = headings.filter((heading) => heading.level === 2);
  const tocList = tocItems
    .map(
      (heading) =>
        `<li class="post-toc__item"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join("\n            ");
  const toc =
    tocItems.length >= 3
      ? `<nav class="post-toc" aria-label="${labels.onThisPage}">
        <p class="post-toc__title">${labels.onThisPage}</p>
        <ol class="post-toc__list">
          ${tocList}
        </ol>
      </nav>`
      : "";
  const mobileToc =
    tocItems.length >= 3
      ? `<details class="post-toc-mobile">
          <summary>${labels.onThisPage}</summary>
          <ol class="post-toc__list">
            ${tocList}
          </ol>
        </details>`
      : "";

  const related = groups
    .filter((candidate) => candidate.slug !== group.slug)
    .map((candidate) => ({ candidate, post: candidate.posts[lang] ?? candidate.posts[other] }))
    .filter((item) => item.post)
    .slice(0, 2);
  const relatedBlock = related.length
    ? `<section class="post__related" aria-labelledby="more-from-the-blog">
          <h2 id="more-from-the-blog">${labels.moreFromBlog}</h2>
          <ul>
            ${related
              .map(
                ({ candidate, post: relatedPost }) =>
                  `<li><a href="${postPath(candidate.slug, relatedPost.lang)}">${escapeHtml(relatedPost.title)}</a><time datetime="${relatedPost.date}">${formatDate(relatedPost.date, lang)}</time></li>`,
              )
              .join("\n            ")}
          </ul>
        </section>`
    : "";

  const cover = post.cover
    ? `\n        <img class="post__cover" src="${escapeHtml(post.cover)}" alt="" width="1200" height="630">`
    : "";
  const tocBlock = toc ? `\n      ${toc}` : "";

  const alternateFooter = alternate
    ? `<a class="post__language" href="${escapeHtml(postPath(group.slug, other))}" hreflang="${LABELS[other].hreflang}">${labels.switchLanguage}</a>`
    : "";

  return `${renderHead({
    lang,
    title: `${post.title} — ColabDesk ${labels.blog}`,
    description: post.description,
    canonical: absolute(postPath(group.slug, lang)),
    alternates,
    cover: post.cover,
    feed: feedPath(lang),
    type: "article",
  })}
  <body class="blog">
    ${renderNav({
      lang,
      alternateHref: alternate ? postPath(group.slug, other) : indexPath(other),
      current: "article",
    })}
    <main class="blog-main ${toc ? "post-layout" : "post-layout post-layout--single"}">
      <article class="post">
        <header class="post__header">
          <a class="post__back-link" href="${indexPath(lang)}">← ${labels.back}</a>
          ${post.category ? `<p class="post__category">${escapeHtml(post.category)}</p>` : ""}
          <h1 class="post__title">${escapeHtml(post.title)}</h1>
          <p class="post__description">${escapeHtml(post.description)}</p>
          <div class="post__byline">
            <span class="post__avatar" aria-hidden="true">
              <img class="only-light" src="/assets/symbol.svg" alt="">
              <img class="only-dark" src="/assets/symbol-white.svg" alt="">
            </span>
            <span class="post__author">${labels.author}</span>
            <span class="post__dot" aria-hidden="true">·</span>
            <time datetime="${post.date}">${formatDate(post.date, lang)}</time>
            <span class="post__dot" aria-hidden="true">·</span>
            <span>${labels.readingTime(minutes)}</span>
          </div>
          ${tags ? `<div class="post__tags">${tags}</div>` : ""}
        </header>${cover}
        ${mobileToc}
        <div class="post__body">${content}</div>
        <footer class="post__footer">
          <a class="post__back" href="${indexPath(lang)}">← ${labels.back}</a>
          ${alternateFooter}
        </footer>
        ${relatedBlock}
      </article>${tocBlock}
    </main>
    ${renderFooter(lang)}
  </body>
</html>
`;
}

function renderIndex(lang, groups) {
  const labels = LABELS[lang];
  const other = LANGS.find((candidate) => candidate !== lang);
  const posts = groups.filter((group) => group.date);

  const items = posts
    .map((group) => {
      const fallback = group.posts[lang] ?? group.posts[other];
      const displayLang = fallback.lang;
      const foreign = displayLang !== lang;
      const tags = fallback.tags.length
        ? `<ul class="tag-list" aria-label="${labels.tag}">${fallback.tags
            .map((tag) => `<li>${escapeHtml(tag)}</li>`)
            .join("")}</ul>`
        : "";
      const language = foreign
        ? `<span class="post-list__language" lang="${LABELS[displayLang].htmlLang}">${displayLang === "zh" ? "中文" : "EN"}</span>`
        : "";
      return `<li class="post-list__item">
          <a class="post-list__link" href="${postPath(group.slug, displayLang)}">
            <time class="post-list__date" datetime="${fallback.date}">${formatDate(fallback.date, lang)}</time>
            <h2 class="post-list__title">${escapeHtml(fallback.title)}</h2>
            <p class="post-list__description">${escapeHtml(fallback.description)}</p>
            <div class="post-list__meta">${tags}${language}</div>
          </a>
        </li>`;
    })
    .join("\n        ");

  const alternates = LANGS.map((candidate) => ({
    hreflang: LABELS[candidate].hreflang,
    href: absolute(indexPath(candidate)),
  }));
  alternates.push({ hreflang: "x-default", href: absolute(indexPath("en")) });

  return `${renderHead({
    lang,
    title: `${labels.blog} — ColabDesk`,
    description: labels.intro,
    canonical: absolute(indexPath(lang)),
    alternates,
    feed: feedPath(lang),
  })}
  <body class="blog">
    ${renderNav({
      lang,
      alternateHref: indexPath(other),
      current: "index",
    })}
    <main class="blog-main">
      <header class="blog-index__header">
        <h1>${labels.blog}</h1>
        <p>${labels.intro}</p>
      </header>
      <ol class="post-list">
        ${items}
      </ol>
    </main>
    ${renderFooter(lang)}
  </body>
</html>
`;
}

function renderFeed(lang, groups) {
  const labels = LABELS[lang];
  const posts = groups.filter((group) => group.posts[lang]);
  const items = posts
    .map((group) => {
      const post = group.posts[lang];
      const url = absolute(postPath(group.slug, lang));
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}</guid>
      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(post.description)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(labels.feedTitle)}</title>
    <link>${escapeXml(absolute(indexPath(lang)))}</link>
    <description>${escapeXml(labels.feedDescription)}</description>
    <language>${lang}</language>
${items}
  </channel>
</rss>
`;
}

function renderSitemap(groups) {
  const urls = [{ loc: absolute("/"), lastmod: null }];
  for (const lang of LANGS) {
    urls.push({ loc: absolute(indexPath(lang)), lastmod: null });
  }
  for (const group of groups) {
    for (const lang of LANGS) {
      const post = group.posts[lang];
      if (!post) continue;
      urls.push({ loc: absolute(postPath(group.slug, lang)), lastmod: post.updated });
    }
  }
  const entries = urls
    .map(({ loc, lastmod }) =>
      lastmod
        ? `  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod></url>`
        : `  <url><loc>${escapeXml(loc)}</loc></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Renders every page into memory, then either writes it or compares it with
 * what is committed. Site-relative paths are the keys, so `--check` and the
 * write path cannot drift.
 */
export function buildBlog({ root = ROOT, check = false, includeDrafts = false } = {}) {
  const postsDir = join(root, "blog", "posts");
  const siteDir = join(root, "site");
  const manifestPath = join(root, "blog", ".manifest.json");

  const groups = readPosts(postsDir, { includeDrafts });
  if (groups.length === 0) throw new Error("no posts found; add blog/posts/<slug>.<lang>.md");

  // A cover is a promise the social card and the article both keep; a typo in
  // the path should fail here, not render a broken image in production.
  for (const group of groups) {
    for (const post of Object.values(group.posts)) {
      if (!post.cover) continue;
      const asset = join(root, "site", post.cover.replace(/^\//, ""));
      if (!existsSync(asset)) {
        throw new Error(`${post.source}: cover not found at site${post.cover}`);
      }
    }
  }

  const outputs = new Map();
  for (const group of groups) {
    for (const lang of LANGS) {
      const post = group.posts[lang];
      if (!post) continue;
      outputs.set(`blog/${lang === "zh" ? "zh/" : ""}${group.slug}/index.html`, renderArticle(group, post, groups));
    }
  }
  for (const lang of LANGS) {
    outputs.set(`blog/${lang === "zh" ? "zh/" : ""}index.html`, renderIndex(lang, groups));
    outputs.set(`blog/${lang === "zh" ? "zh/" : ""}feed.xml`, renderFeed(lang, groups));
  }
  outputs.set("sitemap.xml", renderSitemap(groups));

  const generated = [...outputs.keys()].sort();
  const previous = readManifest(manifestPath);

  if (check) {
    const differences = [];
    for (const [relative, content] of outputs) {
      const file = join(siteDir, relative);
      if (!existsSync(file)) differences.push(`missing: ${relative}`);
      else if (readFileSync(file, "utf8") !== content) differences.push(`changed: ${relative}`);
    }
    for (const relative of previous) {
      if (!outputs.has(relative) && existsSync(join(siteDir, relative))) {
        differences.push(`stale: ${relative}`);
      }
    }
    if (JSON.stringify(previous) !== JSON.stringify(generated)) {
      differences.push("changed: blog/.manifest.json");
    }
    return { check, outputs, generated, differences };
  }

  for (const relative of previous) {
    if (outputs.has(relative)) continue;
    const file = join(siteDir, relative);
    if (existsSync(file)) rmSync(file);
  }
  for (const [relative, content] of outputs) {
    const file = join(siteDir, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify({ generated }, null, 2)}\n`, "utf8");

  return { check, outputs, generated, differences: [] };
}

function readManifest(path) {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data.generated) ? data.generated : [];
  } catch {
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);
  const known = new Set(["--check", "--drafts"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const check = args.includes("--check");
  try {
    const result = buildBlog({ check, includeDrafts: args.includes("--drafts") });
    if (check) {
      if (result.differences.length) {
        console.error("Blog output is out of date:");
        for (const difference of result.differences.slice(0, 20)) console.error(`  ${difference}`);
        console.error("Run `npm run site:blog` and commit the result.");
        process.exitCode = 1;
      } else {
        console.log("Blog output is up to date.");
      }
      return;
    }
    console.log(`Built ${result.generated.length} files under site/.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
