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

/**
 * Opens the first row's menu. The actions are revealed by pointing at the row
 * (and take no clicks until then — nothing invisible should swallow one), so
 * the pointer goes there first, which is also what a person does.
 */
async function openSessionMenu(page: import("@playwright/test").Page): Promise<void> {
  const row = page.locator('[data-testid="session-row"]').first();
  await row.hover();
  await row.locator(".menu__trigger").click();
}

/** The menu item that makes the fake CLI answer with a sentence. */
async function restartKernel(page: import("@playwright/test").Page): Promise<void> {
  await openSessionMenu(page);
  await page.getByRole("menuitem", { name: "重启内核" }).click();
}

test("行内动作的结果是一条会自己走开的消息", async ({ page }) => {
  const toast = page.locator(".toasts .toast");

  await restartKernel(page);

  await expect(toast).toContainText("已重启");
  await expect(toast).toContainText("e2e-alpha");

  // 人话，不是机器之声：消息用的是正文的无衬线体，等宽体留给路径与字节数。
  expect(await toast.evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain("Mono");

  // 自己走开：4 秒后连容器一起消失（`role=status` 的区域只在有消息时存在）。
  await expect(page.locator(".toasts")).toHaveCount(0, { timeout: 10_000 });
});

test("再来一次是同一条消息重启计时，不是叠一条新的", async ({ page }) => {
  await restartKernel(page);
  await expect(page.locator(".toasts .toast")).toHaveCount(1);

  await restartKernel(page);
  await expect(page.locator(".toasts .toast")).toHaveCount(1);
});

test("消息可以当场关掉，不必等它自己消失", async ({ page }) => {
  await restartKernel(page);
  await expect(page.locator(".toasts .toast")).toContainText("已重启");

  await page.locator('[data-testid="toast-dismiss"]').click();
  await expect(page.locator(".toasts")).toHaveCount(0);
});
