/**
 * The text itself, drawn by CodeMirror.
 *
 * The view lives outside React on purpose: the document is the editor's, and
 * keystrokes never travel back through component state — what React owns is
 * which text is on screen, and whether it can be typed into. The surface is
 * built once per `text`: a reload (the same file with different text) replaces
 * it, and with it the undo history, which is the right price for showing what
 * the runtime actually has.
 *
 * Colours arrive as the design system's own variables; a component here that
 * wrote a hex value would be the one place light and dark drift apart.
 */

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { bracketMatching, codeFolding, foldGutter, foldKeymap } from "@codemirror/language";
import { editorHighlighting } from "./editor-highlight";
import { languageForPath } from "./editor-language";

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
  ".cm-content": { padding: "var(--space-3) var(--space-4) var(--space-3) var(--space-2)" },
  // The contenteditable is a text surface, not a control; the caret and
  // selection are its focus cue, not a ring around the document.
  ".cm-content:focus-visible": { outline: "none", boxShadow: "none" },
  ".cm-gutters": {
    backgroundColor: "var(--canvas)",
    color: "var(--mute)",
    border: "none",
    paddingLeft: "var(--space-3)",
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
  ".cm-matchingBracket": {
    backgroundColor: "var(--canvas-soft-2)",
    outline: "1px solid var(--hairline-strong)",
  },
  ".cm-nonmatchingBracket": {
    backgroundColor: "var(--error-soft)",
    color: "var(--error)",
  },
});

export function TextSurface({
  text,
  path,
  lineNumbers: showLineNumbers = true,
  editable = false,
  onReady,
  onChange,
}: {
  text: string;
  /** The file's path: its extension selects the syntax language. */
  path?: string;
  /** Off when the text is two excerpts: numbers between them would be fiction. */
  lineNumbers?: boolean;
  /** Writable: keystrokes land, and the editor keeps undo history for them. */
  editable?: boolean;
  /** The view, for the pane that has to read the document back at save time. */
  onReady?: (view: EditorView) => void;
  /** Fires on every document change; the pane decides what that means. */
  onChange?: (view: EditorView) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ onReady, onChange });
  useEffect(() => {
    latest.current = { onReady, onChange };
  });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const language = path ? languageForPath(path) : null;
    const view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions: [
          // `readOnly` and not `EditorView.editable(false)`: both stop the
          // content from changing, but the latter also drops `contenteditable`,
          // which takes focus away from the DOM — and with it the caret, the
          // selection, copy, and the find panel's key binding.
          EditorState.readOnly.of(!editable),
          ...(editable ? [history(), keymap.of([...defaultKeymap, ...historyKeymap])] : []),
          search(),
          keymap.of(searchKeymap),
          keymap.of(foldKeymap),
          editorHighlighting,
          ...(language ? [language] : []),
          bracketMatching(),
          // A log line or a prose paragraph should not require a horizontal
          // scroll; the file editor wraps by default, like Orca's.
          EditorView.lineWrapping,
          surfaceTheme,
          ...(showLineNumbers ? [lineNumbers(), codeFolding(), foldGutter()] : []),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) latest.current.onChange?.(update.view);
          }),
        ],
      }),
      parent,
    });
    latest.current.onReady?.(view);
    return () => view.destroy();
  }, [text, path, showLineNumbers, editable]);

  return <div className="text-surface" ref={host} />;
}
