/**
 * A file, open as a tab beside the shells, against the fake runtime's files.
 *
 * What is asserted is what a person sees: the tab a double-click opens, that
 * it stands beside the terminal rather than over it, what it says about the
 * file, and that the text in it is the runtime's own. The reading's own
 * judgements (probe window, line alignment, size caps) have unit tests; this is
 * the pane and the gestures that reach it.
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, MOD, openSession, plantDialogAnswer, test } from "./app-launch";

function row(page: Page, name: string): Locator {
  return page.locator(".file-row").filter({ hasText: name });
}

function rowButton(page: Page, name: string): Locator {
  return row(page, name).locator(".file-row__row");
}

/** The tab strip's tab for a file, found by the name it shows. */
function fileTab(page: Page, name: string): Locator {
  return page.getByRole("tab").filter({ hasText: name });
}

/** The pane for one file: named by the file, so a missing name is a failure. */
function pane(page: Page, name: string): Locator {
  return page.locator(`.file-area[aria-label="${name}"]`);
}

/** What the editor is drawing, as text — a viewport's worth of it. */
function surface(page: Page, name: string): Locator {
  return pane(page, name).locator(".cm-content");
}

test("双击把文件开成一个标签，和终端并排", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.getByRole("tab")).toHaveCount(1);

  await rowButton(page, "README.txt").dblclick();

  const tab = fileTab(page, "README.txt");
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  // The shell is still there, still a tab of its own.
  await expect(page.getByRole("tab", { name: "终端 1" })).toHaveCount(1);

  const filePane = pane(page, "README.txt");
  await expect(filePane).toBeVisible();
  await expect(filePane).toContainText("/content/README.txt");
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");
  // A file that fits: line numbers are on; the path is the copy affordance.
  await expect(filePane.locator(".cm-gutters")).toHaveCount(1);
  await expect(filePane.locator('[data-testid="file-path-copy"]')).toBeVisible();
});

test("单击文件名复制完整路径", async ({ app, page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();

  const filePane = pane(page, "README.txt");
  await filePane.locator('[data-testid="file-path-copy"]').click();
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    "/content/README.txt",
  );
  await expect(filePane).toContainText("已复制");
});

test("Markdown opens with its syntax highlighted", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.md").dblclick();

  const filePane = pane(page, "README.md");
  await expect(filePane).toBeVisible();
  await expect(surface(page, "README.md")).toContainText("ColabDesk runtime guide");

  // The stable classes come from the design-token highlight style; finding
  // them proves the Markdown language was mounted, not just the text.
  await expect(filePane.locator(".cm-syntax-heading").first()).toBeVisible();
  await expect(filePane.locator(".cm-syntax-strong").first()).toBeVisible();
  await expect(filePane.locator(".cm-syntax-link").first()).toBeVisible();
  // A fenced block names its own language; the same map loads its parser.
  await expect(filePane.locator(".cm-syntax-string").first()).toBeVisible();

  // Rich is the editable side: a Tiptap surface with its own toolbar, and the
  // source stays mounted (hidden) so switching back keeps the buffer.
  await filePane.locator('[data-testid="markdown-view-rich"]').click();
  const rich = filePane.locator(".rich-markdown-content");
  await expect(rich).toBeVisible();
  await expect(filePane.getByRole("toolbar", { name: "格式" })).toBeVisible();
  await expect(filePane.getByRole("button", { name: "粗体" })).toBeVisible();
  await expect(rich.locator("h1")).toContainText("ColabDesk runtime guide");
  await expect(rich.locator("strong")).toHaveText("Markdown");
  await expect(rich.locator("a")).toHaveAttribute("href", "https://colabdesk.dev");
  await expect(rich.locator("pre code")).toContainText("print('hello from a fence')");
  await expect(filePane.locator(".file-area__source")).toBeHidden();

  await filePane.locator('[data-testid="markdown-view-source"]').click();
  await expect(filePane.locator(".cm-content")).toBeVisible();
});

test("富文本工具栏把 Markdown 写回源码", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.md").dblclick();

  const filePane = pane(page, "README.md");
  await filePane.locator('[data-testid="markdown-view-rich"]').click();
  const rich = filePane.locator(".rich-markdown-content");
  await expect(rich).toBeVisible();

  // A collapsed cursor with Bold active types bold text; the markdown is then
  // serialized back into the CodeMirror buffer the pane saves from.
  await rich.click();
  // Focusing the surface appends trailing empty lines in Tiptap's serialization;
  // that is not an edit, so no save and no dot may appear.
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  await expect(fileTab(page, "README.md").locator(".session-tab__dot")).toHaveCount(0);
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.press("Enter");
  await filePane.getByRole("button", { name: "粗体" }).click();
  await page.keyboard.type("TOOLBAR");
  await expect(rich.locator("strong", { hasText: "TOOLBAR" })).toHaveText("TOOLBAR");

  await filePane.locator('[data-testid="markdown-view-source"]').click();
  await expect(filePane.locator(".cm-content")).toContainText("**TOOLBAR**");
  await expect(filePane.locator('[data-testid="save-file"]')).toBeVisible();
});

test("富文本里撤销回原样：源码和未保存状态一起回到原样", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.md").dblclick();

  const filePane = pane(page, "README.md");
  await filePane.locator('[data-testid="markdown-view-rich"]').click();
  const rich = filePane.locator(".rich-markdown-content");
  await expect(rich).toBeVisible();

  await rich.click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type("TEMP");
  await expect(filePane.locator('[data-testid="save-file"]')).toBeVisible();

  // The editor's undo restores its opening document; the source must then be
  // the file's own text again, not Tiptap's normalization of it.
  await page.keyboard.press(`${MOD}+z`);
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  await expect(fileTab(page, "README.md").locator(".session-tab__dot")).toHaveCount(0);

  await filePane.locator('[data-testid="markdown-view-source"]').click();
  await expect(filePane.locator(".cm-content")).not.toContainText("TEMP");
});

test("顶部一条横线不是 front matter，富文本仍然可用", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.md").dblclick();

  const filePane = pane(page, "README.md");
  await filePane.locator(".cm-content").click();
  await page.keyboard.press(`${MOD}+Home`);
  await page.keyboard.type("---");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await filePane.locator('[data-testid="markdown-view-rich"]').click();
  await expect(filePane.locator(".rich-markdown-content")).toBeVisible();
  await expect(filePane.getByRole("toolbar", { name: "格式" })).toBeVisible();
  await expect(filePane.locator(".markdown-preview")).toHaveCount(0);
});

test("单击只选中：不开标签，也不下载", async ({ page, sandbox }) => {
  await openSession(page, "e2e-alpha");
  // A staged answer makes the old behaviour observable: had the click started a
  // download, this file would exist within the wait below.
  const target = join(sandbox, "click-download.txt");
  plantDialogAnswer(sandbox, "save", [target]);

  await rowButton(page, "README.txt").click();

  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.waitForTimeout(400);
  expect(existsSync(target)).toBe(false);
  // What the row promises is on the row.
  await expect(rowButton(page, "README.txt")).toHaveAttribute("title", "双击打开");
});

test("键盘与菜单是双击的两条等价路径，同一个文件只有一个标签", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await rowButton(page, "README.txt").focus();
  await page.keyboard.press("Enter");
  await expect(fileTab(page, "README.txt")).toBeVisible();

  await rowButton(page, "README.txt").focus();
  await page.keyboard.press("Enter");
  await row(page, "README.txt").getByRole("button", { name: "README.txt 的操作" }).click();
  await page.getByRole("menuitem", { name: "打开" }).click();

  // Three ways in, one tab: the strip is not a history of what was asked for.
  await expect(fileTab(page, "README.txt")).toHaveCount(1);
  await expect(fileTab(page, "README.txt")).toHaveAttribute("aria-selected", "true");
});

test("文件标签与终端标签互相停靠，切回来内容还在", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");

  await page.getByRole("tab", { name: "终端 1" }).click();

  // The terminal is what is shown; the file parks instead of unloading.
  await expect(pane(page, "README.txt")).toBeHidden();
  await expect(page.locator(".terminal-area:visible")).toHaveCount(1);

  await fileTab(page, "README.txt").click();
  await expect(pane(page, "README.txt")).toBeVisible();
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");
});

test("关掉文件标签，回到终端", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  await expect(fileTab(page, "README.txt")).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "关闭 README.txt" }).click();

  await expect(fileTab(page, "README.txt")).toHaveCount(0);
  await expect(page.locator(".terminal-area:visible")).toHaveCount(1);
});

test("超限的日志：只给开头与结尾，省略处以文字交代，且没有行号", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "train.log").dblclick();

  const filePane = pane(page, "train.log");
  await expect(filePane).toContainText("文件较大（2.8 MB），仅显示开头与结尾。");
  await expect(filePane.getByRole("button", { name: "保存" })).toHaveCount(0);
  // Line numbers would be fiction after the gap, so the gutter is gone.
  await expect(filePane.locator(".cm-gutters")).toHaveCount(0);

  await expect(surface(page, "train.log")).toContainText("training begins");
  // The gap marker is not at a fixed scroll position once lines wrap; the
  // editor's own find puts it in view. "MB" occurs in the marker and nowhere
  // in the log, and is ASCII, which a plain input can type.
  await filePane.locator(".cm-content").click();
  await page.keyboard.press(`${MOD}+f`);
  await page.keyboard.type("MB");
  await page.keyboard.press("Enter");
  await expect(filePane.locator(".cm-searchMatch")).toHaveCount(1);
  await expect(surface(page, "train.log")).toContainText("省略");
  await page.keyboard.press("Escape");
  // The tail is the other half of the truncation promise. Find reaches it
  // without depending on scroll heights: the document is long, and CodeMirror
  // measures it while painting, so a direct scroll can stop short.
  await filePane.locator(".cm-content").click();
  await page.keyboard.press(`${MOD}+f`);
  await page.keyboard.type("training done");
  await page.keyboard.press("Enter");
  await expect(filePane.locator(".cm-searchMatch")).toHaveCount(1);
  await expect(surface(page, "train.log")).toContainText("training done");
});

test("在文件里查找：Ctrl+F 打开面板，命中处自己滚到眼前", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "train.log").dblclick();
  const filePane = pane(page, "train.log");
  await expect(surface(page, "train.log")).toContainText("training begins");

  await filePane.locator(".cm-content").click();
  await page.keyboard.press(`${MOD}+f`);
  await expect(filePane.locator(".cm-textfield")).toBeFocused();

  // An ASCII query on purpose: a spec cannot type CJK into a plain input (the
  // browser inserts it without key events, and the panel commits on keyup).
  // What is under test is the mechanism — query, match, jump — not the script.
  await page.keyboard.type("training done");
  await page.keyboard.press("Enter");

  // The last line is 5000 lines down: this only passes if the search moved the
  // editor there.
  await expect(filePane.locator(".cm-searchMatch")).toHaveCount(1);
  await expect(surface(page, "train.log")).toContainText("training done");
  await expect(surface(page, "train.log")).not.toContainText("training begins");
});

test("二进制文件只给一个出口：下载", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "blob.bin").dblclick();

  const filePane = pane(page, "blob.bin");
  await expect(filePane).toContainText("二进制文件无法预览");
  await expect(filePane.locator(".cm-content")).toHaveCount(0);
  // Download lives in the file row's menu; the header stays for viewing.
  await row(page, "blob.bin").getByRole("button", { name: "blob.bin 的操作" }).click();
  await expect(page.getByRole("menuitem", { name: "下载" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("不是 UTF-8 的文件能读，但只说能看", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "legacy.txt").dblclick();

  const filePane = pane(page, "legacy.txt");
  await expect(filePane).toContainText("不是有效的 UTF-8 文本");
  await expect(surface(page, "legacy.txt")).toBeVisible();
  await expect(filePane.getByRole("button", { name: "保存" })).toHaveCount(0);
});

test("改了就存：标签上的点、Ctrl+S 写回，重开是远端的新内容", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");

  await filePane.locator(".cm-content").click();
  await page.keyboard.type("EDITED");

  await expect(filePane.locator('[data-testid="save-file"]')).toBeVisible();
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(1);

  await page.keyboard.press(`${MOD}+s`);

  // Wait for the write to land (the button disappears with the dirty flag),
  // then read the state it left behind.
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(0);
  // The tree shows what the runtime has now: six more bytes than the fixture.
  await expect(row(page, "README.txt")).toContainText("51 B");

  // A round trip, not a buffer: close the tab and open the file again.
  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("EDITED");
});

test("远端先变了：保存不静默覆盖，问到答案才写", async ({ app, page, sandbox }) => {
  // A narrow middle column on purpose: the head has to hold its answers at the
  // pane's own floor, or they slide under the panel next to them — which is how
  // this was found (CI's window is narrower than a desktop's).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(980, 720));
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await filePane.locator(".cm-content").click();
  await page.keyboard.type("MINE");
  await expect(filePane.locator('[data-testid="save-file"]')).toBeVisible();
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(1);

  // Someone else writes the file — the upload path is the one the app has.
  const replacement = join(sandbox, "README.txt");
  writeFileSync(replacement, "REPLACED BY SOMEONE ELSE\n");
  plantDialogAnswer(sandbox, "open", [replacement]);
  await page.getByRole("button", { name: "上传" }).click();
  await page.locator(".dialog").getByRole("button", { name: "替换" }).click();
  await expect(row(page, "README.txt")).toContainText("25 B");

  await filePane.locator(".cm-content").click();
  await page.keyboard.press(`${MOD}+s`);

  await expect(filePane).toContainText("文件已在服务器上更改");
  await expect(filePane.getByRole("dialog", { name: "覆盖「README.txt」？" })).toBeVisible();
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(1);
  await filePane.getByRole("button", { name: "覆盖" }).click();

  await expect(filePane).not.toContainText("文件已在服务器上更改");
  await expect(filePane.locator(".dialog")).toHaveCount(0);
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  // The copy that won is the one the person chose.
  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("MINE");
});

test("富文本里放弃修改并重载，看到的是服务器上的新内容", async ({ page, sandbox }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.md").dblclick();
  const filePane = pane(page, "README.md");
  await filePane.locator('[data-testid="markdown-view-rich"]').click();
  const rich = filePane.locator(".rich-markdown-content");
  await expect(rich).toBeVisible();

  await rich.click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type("MINE");
  await expect(filePane.locator('[data-testid="save-file"]')).toBeVisible();

  // Someone else writes the file while the rich view holds the edit.
  const replacement = join(sandbox, "README.md");
  writeFileSync(replacement, "REPLACED BY SOMEONE ELSE\n");
  plantDialogAnswer(sandbox, "open", [replacement]);
  await page.getByRole("button", { name: "上传" }).click();
  await page.locator(".dialog").getByRole("button", { name: "替换" }).click();
  await expect(row(page, "README.md")).toContainText("25 B");

  await filePane.locator('[data-testid="save-file"]').click();
  await expect(filePane.getByRole("dialog", { name: "覆盖「README.md」？" })).toBeVisible();
  await filePane.getByRole("button", { name: "放弃修改并重新加载" }).click();

  // The reload must replace the rich document too, not just the hidden source.
  await expect(rich).toContainText("REPLACED BY SOMEONE ELSE");
  await expect(rich).not.toContainText("MINE");
  await expect(fileTab(page, "README.md").locator(".session-tab__dot")).toHaveCount(0);
});

test("有未保存的修改时，关标签先问一句；不保存就真的没写", async ({ app, page }) => {
  // Same narrow column as the conflict case: the guard's three answers have to
  // be pressable where the pane can be at its floor.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(980, 720));
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await filePane.locator(".cm-content").click();
  await page.keyboard.type("XX");
  await expect(filePane.locator('[data-testid="save-file"]')).toBeVisible();
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(1);

  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await expect(filePane.getByRole("dialog", { name: "关闭「README.txt」？" })).toBeVisible();
  await filePane
    .getByRole("dialog", { name: "关闭「README.txt」？" })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(filePane.locator(".dialog")).toHaveCount(0);
  await expect(fileTab(page, "README.txt")).toBeVisible();
  await expect(surface(page, "README.txt")).toContainText("XX");

  // The keyboard's way of closing asks the same question.
  await page.keyboard.press(`${MOD}+Shift+W`);
  await expect(filePane.getByRole("dialog", { name: "关闭「README.txt」？" })).toBeVisible();
  await filePane.getByRole("button", { name: "不保存" }).click();

  await expect(fileTab(page, "README.txt")).toHaveCount(0);
  // Nothing was written: the runtime still has the fixture's own text.
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");
  await expect(surface(page, "README.txt")).not.toContainText("XX");
});

test("文件面板停靠时，对话框不抢走终端的 Esc", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await filePane.locator(".cm-content").click();
  await page.keyboard.type("XX");
  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  const dialog = filePane.getByRole("dialog", { name: "关闭「README.txt」？" });
  await expect(dialog).toBeVisible();

  // A new terminal parks the file pane, question and all. That Escape belongs
  // to the terminal, so the hidden question must still be waiting on return.
  await page.keyboard.press("Control+Shift+T");
  await expect(filePane).toBeHidden();
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "README.txt" }).click();
  await expect(dialog).toBeVisible();
});

test("保存还在路上时继续输入：那些字仍然是未保存的", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "big.txt").dblclick();
  const filePane = pane(page, "big.txt");
  await expect(surface(page, "big.txt")).toContainText("the quick brown fox");

  await filePane.locator(".cm-content").click();
  await page.keyboard.type("ONE");
  await page.keyboard.press(`${MOD}+s`);
  // Typed into the window the write is open for (the mock link is throttled to
  // 8 MB/s, so a 1.7 MB save holds it open for a moment). Whatever the
  // scheduling, the pane must not call this saved: the snapshot it wrote is not
  // what the buffer holds.
  await page.keyboard.type("TWO");

  // The button comes back when the write has landed *and* there is still
  // something to save — a pane that called the second edit saved would leave it
  // disabled for good.
  await expect(filePane.locator('[data-testid="save-file"]')).toBeEnabled();

  // The second save carries both edits.
  await page.keyboard.press(`${MOD}+s`);
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  await expect(fileTab(page, "big.txt").locator(".session-tab__dot")).toHaveCount(0);
});

test("不可写的文件：说明白，也不给保存", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "locked.cfg").dblclick();

  const filePane = pane(page, "locked.cfg");
  await expect(filePane).toContainText("文件不可写");
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  await expect(surface(page, "locked.cfg")).toContainText("seed=1");
});
