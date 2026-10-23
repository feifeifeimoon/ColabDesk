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
  // Parsing Markdown normalizes the document (and Tiptap emits updates for
  // selection too). Only a serialization that differs from the document just
  // created here is a person's edit; a click must not make the buffer dirty.
  const lastMarkdown = useRef(markdown);
  const created = useRef(false);

  const sameDocument = (left: string, right: string) =>
    left.replace(/\s+$/, "") === right.replace(/\s+$/, "");

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
      lastMarkdown.current = editor.getMarkdown();
      created.current = true;
    },
    onUpdate: ({ editor }) => {
      if (!created.current) return;
      const next = editor.getMarkdown();
      if (sameDocument(next, lastMarkdown.current)) {
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
