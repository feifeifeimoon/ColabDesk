/**
 * The formatting controls for the rich Markdown editor.
 *
 * A toolbar button keeps the ProseMirror selection: `mousedown` is prevented,
 * so the click does not blur the editor before the command runs. Active marks
 * come from `useEditorState`, not a full re-render on every keystroke.
 */

import type { ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="rich-markdown-toolbar__button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <span className="rich-markdown-toolbar__sep" aria-hidden="true" />;
}

export function RichMarkdownToolbar({ editor, editable }: { editor: Editor | null; editable: boolean }) {
  const { t } = useTranslation();
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      paragraph: current?.isActive("paragraph") ?? false,
      h1: current?.isActive("heading", { level: 1 }) ?? false,
      h2: current?.isActive("heading", { level: 2 }) ?? false,
      h3: current?.isActive("heading", { level: 3 }) ?? false,
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      strike: current?.isActive("strike") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      taskList: current?.isActive("taskList") ?? false,
      blockquote: current?.isActive("blockquote") ?? false,
      codeBlock: current?.isActive("codeBlock") ?? false,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  });

  const off = !editor || !editable;

  return (
    <div className="rich-markdown-toolbar" role="toolbar" aria-label={t("editor.toolbar", "格式")}>
      <ToolbarButton
        label={t("editor.toolbarBody", "正文")}
        active={active?.paragraph}
        disabled={off}
        onClick={() => editor?.chain().focus().setParagraph().run()}
      >
        ¶
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarH1", "一级标题")}
        active={active?.h1}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarH2", "二级标题")}
        active={active?.h2}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarH3", "三级标题")}
        active={active?.h3}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>
      <Separator />
      <ToolbarButton
        label={t("editor.toolbarBold", "粗体")}
        active={active?.bold}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <span className="rich-markdown-toolbar__bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarItalic", "斜体")}
        active={active?.italic}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <span className="rich-markdown-toolbar__italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarStrike", "删除线")}
        active={active?.strike}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <span className="rich-markdown-toolbar__strike">S</span>
      </ToolbarButton>
      <Separator />
      <ToolbarButton
        label={t("editor.toolbarBullet", "项目符号")}
        active={active?.bulletList}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarOrdered", "编号列表")}
        active={active?.orderedList}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarTask", "任务列表")}
        active={active?.taskList}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        ☑
      </ToolbarButton>
      <Separator />
      <ToolbarButton
        label={t("editor.toolbarQuote", "引用")}
        active={active?.blockquote}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarCode", "代码块")}
        active={active?.codeBlock}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      >
        {"</>"}
      </ToolbarButton>
      <Separator />
      <ToolbarButton
        label={t("editor.toolbarUndo", "撤销")}
        disabled={off || !active?.canUndo}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.toolbarRedo", "重做")}
        disabled={off || !active?.canRedo}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        ↷
      </ToolbarButton>
    </div>
  );
}
