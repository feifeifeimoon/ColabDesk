/**
 * The runtime's filesystem over SFTP, against the fake runtime's tree.
 *
 * Folder creation and deletion go through the real `sftp-ops` recursion, so a
 * broken rmdir order shows up here rather than on someone's runtime.
 */

import { expect, openSession, test } from "./app-launch";

function row(page: import("@playwright/test").Page, name: string) {
  return page.locator(".file-row").filter({ hasText: name });
}

test("文件面板列出运行时目录，面包屑进子目录", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await expect(row(page, "README.txt")).toHaveCount(1);
  await expect(row(page, "model.pt")).toHaveCount(1);

  await row(page, "data").locator(".file-name").click();

  await expect(row(page, "sample.csv")).toHaveCount(1);
  await expect(page.locator(".breadcrumb")).toContainText("data");
  // 状态栏的远程路径跟着文件面板走，两个组件说的是同一件事。
  await expect(page.locator(".statusbar")).toContainText("/content/data");
});

test("新建文件夹当场出现在列表里", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(row(page, "README.txt")).toHaveCount(1);

  await page.locator('[data-testid="new-folder"]').click();
  await page.locator('[data-testid="folder-name"]').fill("e2e-folder");
  await page.locator('[data-testid="folder-create"]').click();

  await expect(row(page, "e2e-folder")).toHaveCount(1);
  // 新建的表单收起，输入框不再挂着。
  await expect(page.locator('[data-testid="folder-name"]')).toHaveCount(0);
});

test("删除文件夹要先确认，确认后从列表消失", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await page.locator('[data-testid="new-folder"]').click();
  await page.locator('[data-testid="folder-name"]').fill("e2e-doomed");
  await page.locator('[data-testid="folder-create"]').click();
  await expect(row(page, "e2e-doomed")).toHaveCount(1);

  page.on("dialog", (dialog) => void dialog.accept());
  await row(page, "e2e-doomed").getByRole("button", { name: "删除" }).click();

  await expect(row(page, "e2e-doomed")).toHaveCount(0);
});

test("文件面板可收起，收起后状态栏不再报远程路径", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.locator(".files-panel")).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("/content");

  await page.locator('[data-testid="toggle-files"]').click();
  await expect(page.locator(".files-panel")).toHaveCount(0);
  await expect(page.locator(".statusbar")).not.toContainText("/content");

  await page.locator('[data-testid="toggle-files"]').click();
  await expect(page.locator(".files-panel")).toBeVisible();
});
