/**
 * The text itself, drawn by CodeMirror.
 *
 * The view lives outside React on purpose: the document is the editor's, and
 * keystrokes never travel back through component state. What React owns is
 * which text is on screen — the surface is built once per `text` rather than
 * reconciled, because so far every change of text has meant a different file.
 *
 * Colours arrive as the design system's own variables; a component here that
 * wrote a hex value would be the one place light and dark drift apart.
 */

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { search, searchKeymap } from "@codemirror/search";

const surfaceTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--text-copy)",
    color: "var(--ink)",
    backgroundColor: "var(--canvas)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5",
  },
  ".cm-content": { padding: "var(--space-3) 0" },
  ".cm-gutters": {
    backgroundColor: "var(--canvas)",
    color: "var(--mute)",
    border: "none",
    paddingRight: "var(--space-2)",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--link-bg-soft)",
  },
  ".cm-panels": {
    backgroundColor: "var(--canvas-soft)",
    color: "var(--ink)",
    fontFamily: "var(--font-sans)",
  },
  ".cm-panel.cm-search": { padding: "var(--space-2) var(--space-3)" },
  ".cm-textfield": {
    backgroundColor: "var(--canvas)",
    color: "var(--ink)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-xs)",
  },
  ".cm-button": {
    backgroundColor: "var(--canvas)",
    backgroundImage: "none",
    color: "var(--ink)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-xs)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--link-bg-soft)",
    outline: "1px solid var(--link)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--warning-soft)" },
});

export function TextSurface({
  text,
  lineNumbers: showLineNumbers = true,
}: {
  text: string;
  /** Off when the text is two excerpts: numbers between them would be fiction. */
  lineNumbers?: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions: [
          // `readOnly` and not `EditorView.editable(false)`: both stop the
          // content from changing, but the latter also drops `contenteditable`,
          // which takes focus away from the DOM — and with it the caret, the
          // selection, copy, and the find panel's key binding. A viewer that
          // cannot be focused is a picture of an editor.
          EditorState.readOnly.of(true),
          search(),
          keymap.of(searchKeymap),
          surfaceTheme,
          ...(showLineNumbers ? [lineNumbers()] : []),
        ],
      }),
      parent,
    });
    return () => view.destroy();
  }, [text, showLineNumbers]);

  return <div className="text-surface" ref={host} />;
}
