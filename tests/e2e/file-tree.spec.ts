/**
 * The file tree, against the fake runtime's tree.
 *
 * What is asserted is what a person sees: which rows are on screen, what the
 * folder they opened says about itself, and that the shell writing a directory
 * shows up once the browser is asked to look again. The projection has its own
 * unit tests; this is the pane.
 */

import type { Locator, Page } from "@playwright/test";
import { expect, focusTerminal, openSession, test } from "./app-launch";

function row(page: Page, name: string): Locator {
  return page.locator(".file-row").filter({ hasText: name });
}

/** The button that carries a row's name, clicking it is expanding or opening. */
function rowButton(page: Page, name: string): Locator {
  return row(page, name).locator(".file-row__row");
}

test("树顶是根目录那一行，它的内容是 /content", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await expect(page.getByRole("treeitem").first()).toContainText("/content");
  await expect(row(page, "README.txt")).toHaveCount(1);
});

test("文件夹是展开才去读的，收起只藏不删", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(row(page, "data")).toHaveCount(1);
  // 没展开之前，里面的东西一行都不该在。
  await expect(row(page, "sample.csv")).toHaveCount(0);

  await rowButton(page, "data").click();
  await expect(rowButton(page, "data")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "sample.csv")).toHaveCount(1);

  await rowButton(page, "data").click();
  await expect(rowButton(page, "data")).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "sample.csv")).toHaveCount(0);
  // 收起的是子行，不是文件夹这一行。
  await expect(row(page, "data")).toHaveCount(1);
});

test("文件行是叶子：既没有可展开的语义，也没有那个三角", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  // 打开与下载都在行尾菜单里；行本身只报"这是什么"。见 editor.spec：双击开预览。
  await expect(rowButton(page, "model.pt")).not.toHaveAttribute("aria-expanded", /.*/);
  await expect(row(page, "model.pt").locator(".file-row__twisty svg")).toHaveCount(0);
  await expect(row(page, "data").locator(".file-row__twisty svg")).toHaveCount(1);
});

test("键盘能在树上走：右键展开、左键收起、上下换行", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "data").focus();

  await page.keyboard.press("ArrowRight");
  await expect(row(page, "sample.csv")).toHaveCount(1);

  await page.keyboard.press("ArrowDown");
  await expect(row(page, "sample.csv").locator(".file-row__row")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  // 从子行往左回到父行……
  await expect(rowButton(page, "data")).toBeFocused();
  // ……再往左就是把父行收起来。
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "sample.csv")).toHaveCount(0);
});

test("shell 里建的东西，刷新之后出现在树上", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(row(page, "README.txt")).toHaveCount(1);
  await expect(row(page, "from-shell")).toHaveCount(0);

  // 同一个运行时的两台窗口：终端写进去，浏览器读出来。
  await focusTerminal(page);
  await page.keyboard.type("mkdir /content/from-shell");
  await page.keyboard.press("Enter");
  await expect(page.locator(".terminal-host:visible .xterm-rows")).toContainText("from-shell");

  // 刷新重读根与已展开的目录；新目录出现在它该在的位置。
  await page.getByRole("button", { name: "刷新" }).click();
  await expect(row(page, "from-shell")).toHaveCount(1);
});
