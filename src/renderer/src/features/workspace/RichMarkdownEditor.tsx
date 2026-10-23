/**
 * The editable side of a Markdown file: a Tiptap document with a formatting
 * toolbar.
 *
 * The source editor remains the buffer this pane saves. Every rich edit is
 * serialized back to Markdown and handed to `onChange`, which replaces the
 * CodeMirror document; switching to Source therefore sees exactly what was
 * typed here, and Save/conflict handling keep working unchanged.
 *
 * This module is loaded on demand (`React.lazy` in `FileView`) so Tiptap and
 * ProseMirror stay out of the initial renderer bundle.
 */

import { useRef } from "react";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { RichMarkdownToolbar } from "./RichMarkdownToolbar";

export function RichMarkdownEditor({
  markdown,
  editable,
  onChange,
}: {
  markdown: string;
  editable: boolean;
  onChange: (markdown: string) => void;
}) {
  // Parsing Markdown normalizes the document, and focusing the surface can
  // append trailing empty lines. Neither is a person's edit; a click must not
  // make the buffer dirty.
  const lastMarkdown = useRef(markdown);
  /** The file's own text and Tiptap's first serialization of it. */
  const initialMarkdown = useRef(markdown);
  const initialSerialized = useRef<string | null>(null);
  const created = useRef(false);

  // An undo can return to the opening document with a different number of
  // trailing newlines. Only a history transaction is compared this loosely;
  // a normal edit is compared by content, ignoring only trailing blank lines.
  const sameOpeningDocument = (left: string, right: string) =>
    left.replace(/\s+$/, "") === right.replace(/\s+$/, "");

  // Focusing the surface can append empty lines at the end; that is not an
  // edit. Only trailing line breaks are ignored — a trailing space is content
  // (a hard break), so it still marks the buffer dirty.
  const sameContent = (left: string, right: string) =>
    left.replace(/[\r\n]+$/, "") === right.replace(/[\r\n]+$/, "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ indentation: { style: "space", size: 2 } }),
    ],
    content: markdown,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "markdown-body rich-markdown-content",
        spellcheck: "false",
      },
    },
    onCreate: ({ editor }) => {
      const serialized = editor.getMarkdown();
      initialMarkdown.current = markdown;
      initialSerialized.current = serialized;
      lastMarkdown.current = serialized;
      created.current = true;
    },
    onUpdate: ({ editor, transaction }) => {
      if (!created.current) return;
      const next = editor.getMarkdown();
      if (
        initialSerialized.current !== null &&
        isHistoryTransaction(transaction) &&
        sameOpeningDocument(next, initialSerialized.current)
      ) {
        // The rich document is back to what this editor opened: hand back the
        // file's own text, not Tiptap's normalization of it, or the buffer
        // stays dirty after an edit that no longer exists.
        lastMarkdown.current = next;
        onChange(initialMarkdown.current);
        return;
      }
      if (sameContent(next, lastMarkdown.current)) {
        lastMarkdown.current = next;
        return;
      }
      lastMarkdown.current = next;
      onChange(next);
    },
  });

  return (
    <div className="rich-markdown-editor">
      <RichMarkdownToolbar editor={editor} editable={editable} />
      <div className="rich-markdown-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default RichMarkdownEditor;
