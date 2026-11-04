import { translate } from "../../i18n/i18n";

/**
 * CodeMirror's own panels and gutters speak through `EditorState.phrases`.
 * Without this the find panel and the fold tooltips are the one English
 * surface in a Chinese window. The keys are the library's own strings, read
 * from its `phrase()` calls; the English values reproduce them verbatim.
 */
export function editorPhrases(): Record<string, string> {
  return {
    Find: translate("editor.find", "Find"),
    Replace: translate("editor.replace", "Replace"),
    next: translate("editor.next", "next"),
    previous: translate("editor.previous", "previous"),
    all: translate("editor.all", "all"),
    "match case": translate("editor.matchCase", "match case"),
    regexp: translate("editor.regexp", "regexp"),
    "by word": translate("editor.byWord", "by word"),
    replace: translate("editor.replaceOne", "replace"),
    "replace all": translate("editor.replaceAll", "replace all"),
    close: translate("editor.close", "close"),
    "Fold line": translate("editor.foldLine", "Fold line"),
    "Unfold line": translate("editor.unfoldLine", "Unfold line"),
    "Folded lines": translate("editor.foldedLines", "Folded lines"),
    "Unfolded lines": translate("editor.unfoldedLines", "Unfolded lines"),
    "folded code": translate("editor.foldedCode", "folded code"),
    unfold: translate("editor.unfold", "unfold"),
    "Go to line": translate("editor.goToLine", "Go to line"),
    go: translate("editor.go", "go"),
    "current match": translate("editor.currentMatch", "current match"),
    "on line": translate("editor.onLine", "on line"),
    "replaced match on line $": translate("editor.replacedMatchOnLine", "replaced match on line $"),
    "replaced $ matches": translate("editor.replacedMatches", "replaced $ matches"),
    // A line the reader cannot read at a glance: a control glyph, and the
    // screen-reader announcements folding and deletion make.
    "Control character": translate("editor.controlCharacter", "Control character"),
    "Selection deleted": translate("editor.selectionDeleted", "Selection deleted"),
    to: translate("editor.to", "to"),
  };
}
