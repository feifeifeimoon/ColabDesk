/**
 * The file tree, against the fake runtime's tree.
 *
 * What is asserted is what a person sees: which rows are on screen, what the
 * folder they opened says about itself, and that the shell writing a directory
 * shows up once the browser is asked to look again. The projection has its own
 * unit tests; this is the pane.
 */

import type { Locator, Page } from "@playwright/test";
import { enableFileSizes, expect, focusTerminal, openSession, test } from "./app-launch";

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

test("文件大小默认隐藏，更多菜单里可以打开", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(row(page, "README.txt").locator(".file-size")).toHaveCount(0);

  await enableFileSizes(page);
  await expect(row(page, "README.txt").locator(".file-size")).toHaveText("45 B");
});

test("全部收起合上每一个文件夹，但不删掉它们的行", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "data").click();
  await expect(row(page, "sample.csv")).toHaveCount(1);

  await page.getByRole("button", { name: "更多文件操作" }).click();
  await page.getByRole("menuitem", { name: "全部收起" }).click();

  await expect(row(page, "sample.csv")).toHaveCount(0);
  await expect(rowButton(page, "data")).toHaveAttribute("aria-expanded", "false");
});

test("右键行打开操作菜单，Escape 收起", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await row(page, "README.txt").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "打开" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "复制路径" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);
});

test("键盘的菜单键打开同一张操作菜单，Escape 把焦点还给行", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").focus();

  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "打开" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(rowButton(page, "README.txt")).toBeFocused();
});

test("根行可以用键盘打开菜单，新建入口在菜单里", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.getByRole("treeitem").first().focus();

  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "在此新建文件", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "在此新建文件夹", exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("treeitem").first()).toBeFocused();
});

test("打开的文件在树里标出当前行", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await rowButton(page, "README.txt").dblclick();

  await expect(row(page, "README.txt")).toHaveClass(/file-row--active/);
  await expect(rowButton(page, "README.txt")).toHaveAttribute("aria-current", "true");
});

test("指向文件的符号链接按文件打开，而不是去读目录", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(row(page, "README.link")).toHaveCount(1);

  await rowButton(page, "README.link").dblclick();

  const filePane = page.locator('.file-area[aria-label="README.link"]');
  await expect(filePane).toBeVisible();
  await expect(filePane).toContainText("/content/README.link");
  await expect(filePane.locator(".cm-content")).toContainText("ColabDesk E2E runtime.");
});
