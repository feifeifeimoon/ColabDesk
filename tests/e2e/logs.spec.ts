/**
 * The log, from the outside: one file, named in the settings page, holding what
 * the app actually did.
 *
 * The file is the one thing here that is read from disk rather than from the
 * DOM, and on purpose: it is the artifact the user is asked to attach, so the
 * interesting question is exactly "is the path the app shows the path that has
 * the evidence in it".
 */

import { readFileSync } from "node:fs";
import { expect, test } from "./app-launch";

test("设置页给出日志路径，而且那个文件里确实有刚才发生的事", async ({ page }) => {
  // A create that fails, because the name is already taken: the failure has to
  // end up in the log with the command that caused it.
  await page.locator('[aria-label="新建会话"]').click();
  const setup = page.locator('[data-testid="runtime-setup"]');
  await setup.locator("input[type=text]").fill("e2e-alpha");
  await setup.getByRole("button", { name: "创建" }).click();
  await expect(setup.locator('[data-testid="setup-error"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Settings → About is where a user is told where to look.
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "关于" }).click();

  const row = page.locator(".panel-row", {
    has: page.locator(".panel-row__title", { hasText: "运行日志" }),
  });
  await expect(row).toContainText("colabdesk.log");
  await expect(row.getByRole("button", { name: "打开日志" })).toBeVisible();

  // The shown path, read as a path: if the two ever drift apart, this is the
  // assertion that says so.
  const shown = (await row.locator(".panel-row__value").innerText()).trim();
  const log = readFileSync(shown, "utf8");
  expect(log).toContain("colab new");
  expect(log).toContain("exit 1");
  expect(log).toContain("会话 e2e-alpha 已存在。");
  // And the header that makes a pasted log self-describing.
  expect(log).toContain("ColabDesk");
  expect(log).toContain("安装目录");
});
