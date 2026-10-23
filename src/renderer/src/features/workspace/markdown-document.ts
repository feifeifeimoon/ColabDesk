/**
 * What a Markdown document is, before an editor is allowed to rewrite it.
 *
 * Front matter is the one shape the rich editor does not model: Tiptap would
 * parse the body, serialize it back, and leave the block at the top behind.
 * The check needs the closing fence too — a single `---` at the top is an
 * ordinary horizontal rule, and treating it as front matter would take the
 * editable side away from a normal note.
 */
export function hasFrontMatter(text: string): boolean {
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(text);
}
