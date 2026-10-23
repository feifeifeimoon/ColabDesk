/**
 * The file's language, chosen by extension.
 *
 * This is data, not a component: `TextSurface` mounts the result as a
 * CodeMirror language extension. The list is deliberately the files a Colab
 * runtime actually holds — notes, scripts, configs and the web files beside
 * them — rather than every parser CodeMirror publishes.
 */

import type { Extension } from "@codemirror/state";
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { shell } from "@codemirror/legacy-modes/mode/shell";

/** Shell has no Lezer grammar; the stream parser is the official fallback. */
const SHELL = new LanguageSupport(StreamLanguage.define(shell));

/**
 * The languages a Markdown fence may name. The descriptions load the same
 * supports the extension map uses, so ` ```python ` is highlighted inside a
 * note exactly as it is in a `.py` file.
 */
const CODE_FENCE_LANGUAGES: readonly LanguageDescription[] = [
  LanguageDescription.of({
    name: "Python",
    alias: ["py", "python"],
    extensions: ["py"],
    load: async () => python(),
  }),
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "jsx", "ts", "tsx"],
    extensions: ["js", "ts", "jsx", "tsx"],
    load: async () => javascript({ typescript: true, jsx: true }),
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json"],
    extensions: ["json"],
    load: async () => json(),
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yaml", "yml"],
    extensions: ["yml", "yaml"],
    load: async () => yaml(),
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["sh", "bash", "zsh", "shell"],
    extensions: ["sh"],
    load: async () => SHELL,
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html"],
    extensions: ["html", "htm"],
    load: async () => html(),
  }),
  LanguageDescription.of({
    name: "CSS",
    alias: ["css"],
    extensions: ["css"],
    load: async () => css(),
  }),
];

const BY_EXTENSION: Record<string, () => Extension> = {
  md: () => markdown({ codeLanguages: CODE_FENCE_LANGUAGES }),
  markdown: () => markdown({ codeLanguages: CODE_FENCE_LANGUAGES }),
  mdx: () => markdown({ codeLanguages: CODE_FENCE_LANGUAGES }),
  py: python,
  pyi: python,
  json: json,
  jsonc: json,
  yml: yaml,
  yaml: yaml,
  sh: () => SHELL,
  bash: () => SHELL,
  zsh: () => SHELL,
  ksh: () => SHELL,
  js: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  mts: () => javascript({ typescript: true }),
  cts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  html: html,
  htm: html,
  css: css,
};

/** Everything after the last dot of the basename, lower-cased. */
function extensionOf(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The language extension for a path, or null for plain text. */
export function languageForPath(path: string): Extension | null {
  return BY_EXTENSION[extensionOf(path)]?.() ?? null;
}

/** Whether this path is Markdown, which is the one language with a preview. */
export function isMarkdownPath(path: string): boolean {
  const extension = extensionOf(path);
  return extension === "md" || extension === "markdown" || extension === "mdx";
}
