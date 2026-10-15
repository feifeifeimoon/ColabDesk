/**
 * The runtime's filesystem over SFTP, against the fake runtime's tree.
 *
 * Folder creation and deletion go through the real `sftp-ops` recursion, so a
 * broken rmdir order shows up here rather than on someone's runtime. Transfers
 * run against a bandwidth-limited fake (see `runtime-server.ts`), which is what
 * lets a spec watch one in flight and cancel it.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, openSession, plantDialogAnswer, test } from "./app-launch";

function row(page: import("@playwright/test").Page, name: string) {
  return page.locator(".file-row").filter({ hasText: name });
}

/** A row's actions are behind its ⋯ trigger, the way a session row's are. */
async function openRowMenu(page: import("@playwright/test").Page, name: string): Promise<void> {
  await row(page, name).getByRole("button", { name: `${name} 的操作` }).click();
}

test("文件面板列出运行时目录，展开文件夹就地看到里面", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  await expect(row(page, "README.txt")).toHaveCount(1);
  await expect(row(page, "model.pt")).toHaveCount(1);

  await row(page, "data").locator(".file-row__row").click();

  await expect(row(page, "sample.csv")).toHaveCount(1);
  // 展开不换屏：兄弟行还在，层级靠缩进读出来。
  await expect(row(page, "README.txt")).toHaveCount(1);
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
  await openRowMenu(page, "e2e-doomed");
  await page.getByRole("menuitem", { name: "删除" }).click();

  await expect(row(page, "e2e-doomed")).toHaveCount(0);
});

test("文件面板可收起再展开，树还是展开前那样", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.locator(".files-panel")).toBeVisible();
  await row(page, "data").locator(".file-row__row").click();
  await expect(row(page, "sample.csv")).toHaveCount(1);

  await page.locator('[data-testid="toggle-files"]').click();
  // 收起是藏起来，不是把树折回去——展开状态与读过的目录都留着。
  await expect(page.locator(".files-panel")).toBeHidden();

  await page.locator('[data-testid="toggle-files"]').click();
  await expect(page.locator(".files-panel")).toBeVisible();
  await expect(row(page, "sample.csv")).toHaveCount(1);
});

test("删除符号链接只删链接，它指向的目录还在", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(row(page, "mirror")).toHaveCount(1);

  page.on("dialog", (dialog) => void dialog.accept());
  await openRowMenu(page, "mirror");
  await page.getByRole("menuitem", { name: "删除" }).click();
  await expect(row(page, "mirror")).toHaveCount(0);

  // The link is gone and its target is untouched — the whole reason delete
  // asks `lstat` rather than `stat`.
  await expect(row(page, "data")).toHaveCount(1);
  await row(page, "data").locator(".file-row__row").click();
  await expect(row(page, "sample.csv")).toHaveCount(1);
});

test("上传一个文件，进度行走完，文件出现在列表里", async ({ page, sandbox }) => {
  const source = join(sandbox, "e2e-upload.txt");
  writeFileSync(source, "from the desktop\n");
  plantDialogAnswer(sandbox, "open", [source]);

  await openSession(page, "e2e-alpha");
  await page.getByRole("button", { name: "上传" }).click();

  await expect(page.locator(".transfer")).toContainText("e2e-upload.txt");
  await expect(page.locator(".transfer__state")).toHaveText("完成");
  await expect(row(page, "e2e-upload.txt")).toHaveCount(1);
  // Nothing is left staged beside it: the name it landed under is the name it
  // was asked for.
  await expect(page.locator(".file-row").filter({ hasText: ".part-" })).toHaveCount(0);
});

test("同名文件先问，选「两个都留」时原文件不动", async ({ page, sandbox }) => {
  const source = join(sandbox, "e2e-keep.txt");
  writeFileSync(source, "first\n");
  plantDialogAnswer(sandbox, "open", [source]);

  await openSession(page, "e2e-alpha");
  await page.getByRole("button", { name: "上传" }).click();
  await expect(page.locator(".transfer__state")).toHaveText("完成");

  writeFileSync(source, "second\n");
  await page.getByRole("button", { name: "上传" }).click();

  const dialog = page.locator(".dialog");
  await expect(dialog).toContainText("同名文件已存在");
  await dialog.getByRole("button", { name: "两个都留" }).click();

  await expect(row(page, "e2e-keep copy.txt")).toHaveCount(1);
  await expect(row(page, "e2e-keep.txt")).toHaveCount(1);
});

test("同名文件选「跳过」时不上传，行里说明跳过了", async ({ page, sandbox }) => {
  const source = join(sandbox, "e2e-skip.txt");
  writeFileSync(source, "first\n");
  plantDialogAnswer(sandbox, "open", [source]);

  await openSession(page, "e2e-alpha");
  await page.getByRole("button", { name: "上传" }).click();
  await expect(page.locator(".transfer__state")).toHaveText("完成");

  await page.getByRole("button", { name: "上传" }).click();
  await page.locator(".dialog").getByRole("button", { name: "跳过" }).click();

  // Rows stay in the list, so the second one is the one this test is about.
  await expect(page.locator(".transfer__state").last()).toHaveText("已跳过 1 项");
  await expect(row(page, "e2e-skip copy.txt")).toHaveCount(0);
});

test("上传文件夹会连子目录一起传，行里报文件的进度", async ({ page, sandbox }) => {
  const folder = join(sandbox, "e2e-project");
  mkdirSync(join(folder, "sub"), { recursive: true });
  writeFileSync(join(folder, "main.py"), "print(1)\n");
  writeFileSync(join(folder, "sub", "helper.py"), "x = 1\n");
  plantDialogAnswer(sandbox, "openDirectory", [folder]);

  await openSession(page, "e2e-alpha");
  await page.getByRole("button", { name: "选择文件夹" }).click();

  await expect(page.locator(".transfer")).toContainText("e2e-project (2/2)");
  await expect(page.locator(".transfer__state")).toHaveText("完成");

  await row(page, "e2e-project").locator(".file-row__row").click();
  await expect(row(page, "main.py")).toHaveCount(1);
  await row(page, "sub").locator(".file-row__row").click();
  await expect(row(page, "helper.py")).toHaveCount(1);
});

test("下载文件夹落到选定目录，中间没有残留的分片", async ({ page, sandbox }) => {
  const target = join(sandbox, "e2e-downloads");
  mkdirSync(target, { recursive: true });
  plantDialogAnswer(sandbox, "openDirectory", [target]);

  await openSession(page, "e2e-alpha");
  await openRowMenu(page, "data");
  await page.getByRole("menuitem", { name: "下载文件夹" }).click();
  await expect(page.locator(".transfer__state")).toHaveText("完成");

  // The point of the download: a complete file at the chosen place, and no
  // half-finished staging directory next to it.
  const landed = join(target, "data", "sample.csv");
  await expect.poll(() => existsSync(landed)).toBe(true);
  expect(readFileSync(landed, "utf8")).toBe("x,y\n1,2\n");
  await expect.poll(() => readdirSync(target).filter((name) => name.includes(".part-"))).toEqual([]);
});

test("传输中按取消，行里说已取消，文件没有落地", async ({ page, sandbox }) => {
  const source = join(sandbox, "e2e-cancel.bin");
  // Big enough that the fake runtime's bandwidth keeps it in flight for a
  // moment; a small file would be over before the click landed.
  writeFileSync(source, Buffer.alloc(8 * 1024 * 1024, 3));
  plantDialogAnswer(sandbox, "open", [source]);

  await openSession(page, "e2e-alpha");
  await page.getByRole("button", { name: "上传" }).click();

  await page.locator('.transfer button[data-testid^="cancel-"]').click();
  await expect(page.locator(".transfer__state").last()).toHaveText("已取消");
  await expect(row(page, "e2e-cancel.bin")).toHaveCount(0);
  await expect(page.locator(".file-row").filter({ hasText: ".part-" })).toHaveCount(0);
});
