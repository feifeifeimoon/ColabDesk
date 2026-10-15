/**
 * The terminal, driven through the same WebSocket + SSH path it uses against a
 * real runtime.
 *
 * Assertions target what the user can see, never app state: a store round trip
 * once let a broken renderer ship, and the point of this lane is the pixels.
 */

import type { Page } from "@playwright/test";
import { expect, focusTerminal, openSession, terminalRows, terminalText, test } from "./app-launch";

const PROMPT = "root@e2e-runtime:";

/** Waits until the shell has answered `times` commands (its prompt, that often). */
async function waitForPrompts(page: Page, times: number): Promise<void> {
  await expect
    .poll(async () => (await terminalText(page)).split(PROMPT).length - 1)
    .toBeGreaterThanOrEqual(times);
}

/** The session's tab in the strip, which is named after its shell number. */
function shellTab(page: Page, ordinal: number) {
  return page.getByRole("tab", { name: `终端 ${ordinal}` });
}

/** How often `needle` appears in what the visible terminal shows. */
async function occurrences(page: Page, needle: string): Promise<number> {
  return (await terminalText(page)).split(needle).length - 1;
}

test("打开会话就连上运行时，按键走到远端再回来", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await expect(terminalRows(page)).toContainText("shell #1");

  // 打开终端后应用自己会发一行 `cd /content`，所以要等第二次提示符再动手。
  await waitForPrompts(page, 2);

  // 单键回显：每个字符都是主进程 → SSH → 远端 shell → 回来这一趟。
  await focusTerminal(page);
  await page.keyboard.type("echo HEL");
  await expect(terminalRows(page)).toContainText("HEL");

  await page.keyboard.press("Enter");
  await waitForPrompts(page, 3);

  // `uname` 的输出在输入里不存在，所以它只可能来自被执行的命令。
  await page.keyboard.type("uname");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("GNU/Linux");
});

/**
 * The startup line belongs to whoever opens the shell: the main process writes
 * it in `openShell`, before the renderer even hears about the channel. The pane
 * used to send the same `cd /content` again once its open round trip resolved,
 * so every fresh shell ran it twice — two lines in the scrollback, two entries
 * in the history, two prompts.
 *
 * The probe is what makes the count deterministic: by the time `pwd`'s answer
 * is on screen, an earlier duplicate must have been echoed too.
 */
test("新终端的初始 cd 只下发一次", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await waitForPrompts(page, 2);
  await focusTerminal(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await waitForPrompts(page, 3);

  // 一次是远端的回显；两次就是又发了一遍。
  expect(await occurrences(page, "cd /content 2>/dev/null")).toBe(1);
});

test("每个会话连自己的运行时，标签条只显示选中会话的终端", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");
  await expect(page.locator('[role="tab"]')).toHaveCount(1);

  await openSession(page, "e2e-beta");
  await expect(terminalRows(page)).toContainText("shell #2");
  // beta 的终端条里没有 alpha 的标签——那是另一个会话的工作区。
  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(page.locator('[role="tab"]')).toContainText("终端 1");

  // 切回去，alpha 的连接一直在。
  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await expect(terminalRows(page)).toContainText("shell #1");
});

/**
 * The regression this suite was built for: switching away used to unmount the
 * other tab's pane, which closed its SSH channel and left the remote shell dead
 * — along with anything it was running.
 *
 * Both halves matter. The banner still reading `shell #1` is what tells a
 * surviving pane from a reconnected one (a reconnect would be a new number),
 * and the prompt count is what tells a live shell from a restored buffer.
 */
test("切换会话不重建终端，那个 shell 还活着", async ({ page }) => {
  const dataPrompt = "root@e2e-runtime:/content/data# ";

  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");
  await waitForPrompts(page, 2);

  // Leave state behind that only a surviving shell can still have.
  await focusTerminal(page);
  await page.keyboard.type("cd /content/data");
  await page.keyboard.press("Enter");
  await expect.poll(() => occurrences(page, dataPrompt)).toBeGreaterThanOrEqual(1);

  await openSession(page, "e2e-beta");
  await expect(terminalRows(page)).toContainText("shell #2");

  await openSession(page, "e2e-alpha");

  // Same pane (buffer intact, still shell #1) …
  await expect(terminalRows(page)).toContainText("shell #1");
  await expect.poll(() => occurrences(page, dataPrompt)).toBeGreaterThanOrEqual(1);
  // … and both sessions' shells are mounted, not just the one on screen.
  await expect(page.locator(".terminal-host")).toHaveCount(2);

  // Same shell: it answers, in the directory it was left in.
  await focusTerminal(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await expect.poll(() => occurrences(page, dataPrompt)).toBeGreaterThanOrEqual(2);
});

test("同一个会话可以开多个终端，各自独立不串台", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");

  await page.locator('[data-testid="new-terminal"]').click();
  await expect(terminalRows(page)).toContainText("shell #2");
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  await expect(page.locator(".terminal-host")).toHaveCount(2);

  await waitForPrompts(page, 2);
  await focusTerminal(page);
  await page.keyboard.type("echo SECOND-ONLY");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("SECOND-ONLY");

  // 第一条 shell 不该看到第二条的输出：两 pane 都在，但只写自己的那一个。
  await shellTab(page, 1).click();
  await expect(terminalRows(page)).toContainText("shell #1");
  await expect(terminalRows(page)).not.toContainText("SECOND-ONLY");

  // 而且它还是活的。
  await waitForPrompts(page, 2);
  await focusTerminal(page);
  await page.keyboard.type("echo FIRST-ONLY");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("FIRST-ONLY");
});

test("关掉一个终端，会话的连接留着；关掉最后一个才断开", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");

  await page.locator('[data-testid="new-terminal"]').click();
  await expect(page.locator('[role="tab"]')).toHaveCount(2);

  await page.getByLabel("关闭终端 2").click();

  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await expect(terminalRows(page)).toContainText("shell #1");

  await page.getByLabel("关闭终端 1").click();

  await expect(page.locator(".terminal-host")).toHaveCount(0);
  await expect(page.locator('[data-testid="terminal-count"]')).toHaveText("0");
  await expect(page.locator(".startpage")).toContainText("还没有终端");
});

test("粘贴走括号粘贴，多行文本的换行不会丢", async ({ app, page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  // 剪贴板只有主进程有；写进去的是用户复制的那份文本。
  await app.evaluate(({ clipboard }) => clipboard.writeText("echo FIRST-LINE\n echo SECOND-LINE"));
  await focusTerminal(page);
  await page.keyboard.press("Control+Shift+V");

  // 一次粘贴被包在一对标记里，说明远端能分清"粘贴"和"逐字输入"。
  await expect(terminalRows(page)).toContainText("[paste-start]");
  await expect(terminalRows(page)).toContainText("[paste-end]");
  // 换行被归一成回车：两行都真的跑起来了，而不是粘成一行。
  await expect(terminalRows(page)).toContainText("FIRST-LINE");
  await expect(terminalRows(page)).toContainText("SECOND-LINE");
});

test("粘贴里的转义字符显示成符号，不会当作控制码送出去", async ({ app, page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  await app.evaluate(({ clipboard }) => clipboard.writeText("echo \u001bDANGER"));
  await focusTerminal(page);
  await page.keyboard.press("Control+Shift+V");

  // U+241B 是 ESC 的可见替身：它被当作普通字符打进命令行，而不是被解释。
  await expect(terminalRows(page)).toContainText("␛DANGER");
});

test("Ctrl+Shift+F 打开查找，Esc 关上并把键盘还给终端", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);
  await focusTerminal(page);

  await page.keyboard.press("Control+Shift+F");
  const field = page.locator('[data-testid="terminal-search"]');
  await expect(field).toBeFocused();

  await field.fill("shell");
  await page.keyboard.press("Enter");
  // 命中被终端自己的选中色标出来，因此可以直接复制。
  await expect
    .poll(() => page.locator(".terminal-host:visible .xterm-selection").count())
    .toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
});

test("shell 退出后重连，之前的输出还在", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);
  await focusTerminal(page);
  await page.keyboard.type("echo KEEPME");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("KEEPME");

  await page.keyboard.type("exit");
  await page.keyboard.press("Enter");
  await expect(page.locator(".terminal-notice")).toContainText("连接已断开");

  await page.getByRole("button", { name: "重试连接" }).click();

  // 新 shell 起来了，而重连没有清屏：上一轮跑过的东西仍然在。
  await expect(terminalRows(page)).toContainText("shell #2");
  await expect(terminalRows(page)).toContainText("KEEPME");
});

test("一次刷掉几兆输出，提示符还会回来", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);
  await focusTerminal(page);

  // 远超窗口能装下的量：主进程按高水位让 shell 停过，也必须在渲染层追平后
  // 放开它，否则提示符永远不会回来。
  await page.keyboard.type("flood 2000000");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("flood done", { timeout: 40_000 });

  await focusTerminal(page);
  await page.keyboard.type("echo STILL-ALIVE");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("STILL-ALIVE");
});
