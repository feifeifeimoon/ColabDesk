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
  const occurrences = async (needle: string): Promise<number> =>
    (await terminalText(page)).split(needle).length - 1;

  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");
  await waitForPrompts(page, 2);

  // Leave state behind that only a surviving shell can still have.
  await focusTerminal(page);
  await page.keyboard.type("cd /content/data");
  await page.keyboard.press("Enter");
  await expect.poll(() => occurrences(dataPrompt)).toBeGreaterThanOrEqual(1);

  await openSession(page, "e2e-beta");
  await expect(terminalRows(page)).toContainText("shell #2");

  await openSession(page, "e2e-alpha");

  // Same pane (buffer intact, still shell #1) …
  await expect(terminalRows(page)).toContainText("shell #1");
  await expect.poll(() => occurrences(dataPrompt)).toBeGreaterThanOrEqual(1);
  // … and both sessions' shells are mounted, not just the one on screen.
  await expect(page.locator(".terminal-host")).toHaveCount(2);

  // Same shell: it answers, in the directory it was left in.
  await focusTerminal(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await expect.poll(() => occurrences(dataPrompt)).toBeGreaterThanOrEqual(2);
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
  await expect(page.locator('[data-testid="terminal-count"]')).toContainText("0 终端");
  await expect(page.locator(".startpage")).toContainText("还没有终端");
});
