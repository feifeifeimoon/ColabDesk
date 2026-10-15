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
import { expect, openSession, plantDialogAnswer, test } from "./app-launch";

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

async function scrollSurface(page: Page, name: string, where: "middle" | "bottom"): Promise<void> {
  await pane(page, name)
    .locator(".cm-scroller")
    .evaluate((element, target) => {
      element.scrollTop = target === "bottom" ? element.scrollHeight : element.scrollHeight / 2;
    }, where);
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
  // A file that fits: line numbers are on, and there is a way out that is not
  // an editor yet.
  await expect(filePane.locator(".cm-gutters")).toHaveCount(1);
  await expect(filePane.getByRole("button", { name: "下载到本地" })).toBeVisible();
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
  await expect(filePane).toContainText("文件较大（2.8 MB），只显示了开头与结尾。");
  await expect(filePane).toContainText("只读");
  await expect(filePane.getByRole("button", { name: "保存" })).toHaveCount(0);
  // Line numbers would be fiction after the gap, so the gutter is gone.
  await expect(filePane.locator(".cm-gutters")).toHaveCount(0);

  await expect(surface(page, "train.log")).toContainText("training begins");
  await scrollSurface(page, "train.log", "middle");
  await expect(surface(page, "train.log")).toContainText("省略");
  await scrollSurface(page, "train.log", "bottom");
  await expect(surface(page, "train.log")).toContainText("training done");
});

test("在文件里查找：Ctrl+F 打开面板，命中处自己滚到眼前", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "train.log").dblclick();
  const filePane = pane(page, "train.log");
  await expect(surface(page, "train.log")).toContainText("training begins");

  await filePane.locator(".cm-content").click();
  await page.keyboard.press("Control+f");
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
  await expect(filePane.getByRole("button", { name: "下载到本地" })).toBeVisible();
  await expect(filePane.locator(".cm-content")).toHaveCount(0);
});

test("不是 UTF-8 的文件能读，但只说能看", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "legacy.txt").dblclick();

  const filePane = pane(page, "legacy.txt");
  await expect(filePane).toContainText("不是有效的 UTF-8 文本");
  await expect(filePane).toContainText("只读");
  await expect(surface(page, "legacy.txt")).toBeVisible();
  await expect(filePane.getByRole("button", { name: "保存" })).toHaveCount(0);
});

test("改了就存：未保存的标记、Ctrl+S 写回，重开是远端的新内容", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");

  await filePane.locator(".cm-content").click();
  await page.keyboard.type("EDITED");

  await expect(filePane).toContainText("未保存");
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(1);

  await page.keyboard.press("Control+s");

  await expect(filePane.locator('[data-testid="save-file"]')).toBeDisabled();
  await expect(filePane).not.toContainText("未保存");
  await expect(fileTab(page, "README.txt").locator(".session-tab__dot")).toHaveCount(0);
  // The tree shows what the runtime has now: six more bytes than the fixture.
  await expect(row(page, "README.txt")).toContainText("51 B");

  // A round trip, not a buffer: close the tab and open the file again.
  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("EDITED");
});

test("远端先变了：保存不静默覆盖，问到答案才写", async ({ page, sandbox }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await filePane.locator(".cm-content").click();
  await page.keyboard.type("MINE");
  await expect(filePane).toContainText("未保存");

  // Someone else writes the file — the upload path is the one the app has.
  const replacement = join(sandbox, "README.txt");
  writeFileSync(replacement, "REPLACED BY SOMEONE ELSE\n");
  plantDialogAnswer(sandbox, "open", [replacement]);
  await page.getByRole("button", { name: "上传" }).click();
  await page.locator(".dialog").getByRole("button", { name: "替换" }).click();
  await expect(row(page, "README.txt")).toContainText("25 B");

  await filePane.locator(".cm-content").click();
  await page.keyboard.press("Control+s");

  await expect(filePane).toContainText("文件在服务器上已改变");
  await expect(filePane).toContainText("未保存");
  await filePane.getByRole("button", { name: "覆盖" }).click();

  await expect(filePane.locator('[data-testid="save-file"]')).toBeDisabled();
  await expect(filePane).not.toContainText("文件在服务器上已改变");
  // The copy that won is the one the person chose.
  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("MINE");
});

test("有未保存的修改时，关标签先问一句；不保存就真的没写", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();
  const filePane = pane(page, "README.txt");
  await filePane.locator(".cm-content").click();
  await page.keyboard.type("XX");
  await expect(filePane).toContainText("未保存");

  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await expect(filePane).toContainText("有未保存的修改");
  await filePane.getByRole("button", { name: "取消" }).click();
  await expect(fileTab(page, "README.txt")).toBeVisible();
  await expect(surface(page, "README.txt")).toContainText("XX");

  // The keyboard's way of closing asks the same question.
  await page.keyboard.press("Control+Shift+W");
  await expect(filePane).toContainText("有未保存的修改");
  await filePane.getByRole("button", { name: "不保存" }).click();

  await expect(fileTab(page, "README.txt")).toHaveCount(0);
  // Nothing was written: the runtime still has the fixture's own text.
  await rowButton(page, "README.txt").dblclick();
  await expect(surface(page, "README.txt")).toContainText("ColabDesk E2E runtime.");
  await expect(surface(page, "README.txt")).not.toContainText("XX");
});

test("不可写的文件：说明白，也不给保存", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "locked.cfg").dblclick();

  const filePane = pane(page, "locked.cfg");
  await expect(filePane).toContainText("只读");
  await expect(filePane).toContainText("这个文件不可写");
  await expect(filePane.locator('[data-testid="save-file"]')).toHaveCount(0);
  await expect(surface(page, "locked.cfg")).toContainText("seed=1");
});
