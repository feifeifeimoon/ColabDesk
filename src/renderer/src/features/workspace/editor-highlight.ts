/**
 * The editor's syntax palette, mapped onto the design system tokens.
 *
 * A hex value here would be the one place the editor drifted from the rest of
 * the interface; every colour is a token, so light and dark flip together.
 * The stable `cm-syntax-*` classes are for the e2e that proves a language is
 * actually mounted, not merely that the text appeared.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const editorHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [t.comment, t.lineComment, t.blockComment],
      color: "var(--mute)",
      fontStyle: "italic",
      class: "cm-syntax-comment",
    },
    {
      tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.definitionKeyword],
      color: "var(--violet)",
      class: "cm-syntax-keyword",
    },
    {
      tag: [t.string, t.special(t.string), t.regexp, t.escape],
      color: "var(--cyan-deep)",
      class: "cm-syntax-string",
    },
    {
      tag: [t.number, t.bool, t.null, t.atom],
      color: "var(--warning-deep)",
      class: "cm-syntax-literal",
    },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName],
      color: "var(--link-deep)",
      class: "cm-syntax-function",
    },
    {
      tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)],
      color: "var(--violet)",
      class: "cm-syntax-type",
    },
    {
      tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)],
      color: "var(--link-deep)",
      class: "cm-syntax-property",
    },
    {
      tag: [t.variableName, t.definition(t.variableName)],
      color: "var(--body)",
    },
    {
      tag: [t.operator, t.punctuation, t.separator, t.bracket],
      color: "var(--body)",
    },
    {
      tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
      color: "var(--ink)",
      fontWeight: "600",
      class: "cm-syntax-heading",
    },
    { tag: t.strong, fontWeight: "600", class: "cm-syntax-strong" },
    { tag: t.emphasis, fontStyle: "italic", class: "cm-syntax-emphasis" },
    {
      tag: [t.link, t.url],
      color: "var(--link)",
      textDecoration: "underline",
      class: "cm-syntax-link",
    },
    { tag: t.monospace, color: "var(--cyan-deep)", class: "cm-syntax-monospace" },
    { tag: t.quote, color: "var(--mute)", fontStyle: "italic", class: "cm-syntax-quote" },
    { tag: [t.meta, t.processingInstruction, t.documentMeta], color: "var(--mute)" },
    { tag: t.invalid, color: "var(--error)" },
  ]),
);
