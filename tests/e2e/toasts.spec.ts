/**
 * Where the result of a row action goes.
 *
 * It is a message in the corner that leaves on its own: the row it belongs to
 * may be scrolled away or renamed by the time it is read, and a confirmation
 * that has to be dismissed is a duty, not a notification. The tests below are
 * the three things that make it a message rather than a strip — it says what
 * happened, it can be got rid of, and it goes away by itself.
 */

import { expect, test } from "./app-launch";

/** The menu item that only copies: no side effects for the fake CLI to answer. */
async function copySshCommand(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(".session-row .menu__trigger").first().click();
  await page.getByRole("menuitem", { name: "复制 ssh 命令" }).click();
}

test("行内动作的结果是一条会自己走开的消息", async ({ app, page }) => {
  await copySshCommand(page);

  const toast = page.locator(".toasts .toast");
  await expect(toast).toContainText("已复制");
  await expect(toast).toContainText("ssh colabdesk-e2e-alpha");

  // 人话，不是机器之声：消息用的是正文的无衬线体，等宽体留给路径与字节数。
  expect(await toast.evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain("Mono");

  // 而且剪贴板里真的有了那句话：这条断言顺手钉住"复制"本身——整条桥曾经是坏的
  // （clipboard 只有主进程有，preload 里拿到的永远是 undefined）。
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("ssh colabdesk-e2e-alpha");

  // 自己走开：4 秒后连容器一起消失（`role=status` 的区域只在有消息时存在）。
  await expect(page.locator(".toasts")).toHaveCount(0, { timeout: 10_000 });
});

test("再来一次是同一条消息重启计时，不是叠一条新的", async ({ page }) => {
  await copySshCommand(page);
  await expect(page.locator(".toasts .toast")).toHaveCount(1);

  await copySshCommand(page);
  await expect(page.locator(".toasts .toast")).toHaveCount(1);
});

test("消息可以当场关掉，不必等它自己消失", async ({ page }) => {
  await copySshCommand(page);
  const toast = page.locator(".toasts .toast");
  await expect(toast).toContainText("已复制");

  await page.locator('[data-testid="toast-dismiss"]').click();
  await expect(page.locator(".toasts")).toHaveCount(0);
});
