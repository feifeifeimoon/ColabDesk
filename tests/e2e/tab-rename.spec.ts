/**
 * Naming a shell, driven through the strip the way a user drives it.
 *
 * Two of these are not about renaming at all but about what renaming forced:
 * the app's Ctrl+Shift combinations used to fire from anywhere, and the guard
 * that stops them inside a text field must not stop them in the terminal —
 * where the keyboard's DOM host is xterm's own hidden textarea.
 */

import type { Page } from "@playwright/test";
import { expect, focusTerminal, openSession, terminalText, test } from "./app-launch";

const PROMPT = "root@e2e-runtime:";

async function waitForPrompts(page: Page, times: number): Promise<void> {
  await expect
    .poll(async () => (await terminalText(page)).split(PROMPT).length - 1)
    .toBeGreaterThanOrEqual(times);
}

/** The strip's active tab label — the one an edit opens on. */
function activeLabel(page: Page) {
  return page.locator(".session-tab--active .truncate");
}

test("双击标签名就地改名：Enter 提交、Esc 取消、清空回到默认名", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  const field = page.getByTestId("tab-rename");

  await activeLabel(page).dblclick();
  // 打开时带着当前的名字：整体替换直接打字，微调按方向键。
  await expect(field).toHaveValue("终端 1");
  await field.fill("训练机 A");
  await field.press("Enter");
  await expect(activeLabel(page)).toHaveText("训练机 A");

  // Esc 丢掉的是草稿，不是名字。
  await activeLabel(page).dblclick();
  await field.fill("别存这个");
  await field.press("Escape");
  await expect(activeLabel(page)).toHaveText("训练机 A");

  // 清空 = 恢复默认，而不是留一个空标签。
  await activeLabel(page).dblclick();
  await field.fill("");
  await field.press("Enter");
  await expect(activeLabel(page)).toHaveText("终端 1");
  await expect(page.getByTestId("tab-rename")).toHaveCount(0);
});

test("双击后直接回车不算改过名：切界面语言，标签名跟着变", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  // 不改就回车：默认名是翻出来的，存下去会把标签锁死在中文。
  await activeLabel(page).dblclick();
  await page.getByTestId("tab-rename").press("Enter");

  await page.locator('[data-testid="open-settings"]').click();
  await page.getByRole("button", { name: "外观" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await page.locator('[data-testid="close-settings"]').click();

  await expect(activeLabel(page)).toHaveText("Terminal 1");
});

test("改名之后 × 的可访问名与中键关闭都跟着新名字走", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(page.locator('[role="tab"]')).toHaveCount(2);

  await activeLabel(page).dblclick();
  await page.getByTestId("tab-rename").fill("训练机 A");
  await page.getByTestId("tab-rename").press("Enter");

  // 屏幕阅读器念的是用户给的名字，不是序号。
  const close = page.getByLabel("关闭 训练机 A");
  await expect(close).toBeVisible();

  await page.getByRole("tab", { name: "训练机 A" }).click({ button: "middle" });
  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "终端 1" })).toBeVisible();
});

test("改名框里的中键归输入框：不会把正在改的标签关掉", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  await activeLabel(page).dblclick();
  const field = page.getByTestId("tab-rename");
  await field.click({ button: "middle" });

  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(field).toBeVisible();
});

test("光标在终端里时，Ctrl+Shift+T/W 仍然有效", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  // 键盘的宿主是 xterm 自己插的 textarea：让路的规则不能把终端一起让掉。
  await focusTerminal(page);
  await page.keyboard.press("Control+Shift+T");
  await expect(page.locator('[role="tab"]')).toHaveCount(2);

  await focusTerminal(page);
  await page.keyboard.press("Control+Shift+W");
  await expect(page.locator('[role="tab"]')).toHaveCount(1);
});

test("改名框里按 Ctrl+Shift+W 不会把正在改的标签关掉", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  await activeLabel(page).dblclick();
  const field = page.getByTestId("tab-rename");
  await field.fill("训练机 A");
  await field.press("Control+Shift+W");

  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(field).toBeVisible();

  // 草稿还在手上，回车就能落下。
  await field.press("Enter");
  await expect(activeLabel(page)).toHaveText("训练机 A");
});
