import { expect, test, withClipboardLock } from "./app-launch";

test("会话菜单的 SSH 配置是一张可复制的连接卡", async ({ app, page }) => {
  const row = page.locator('[data-testid="session-row"]').first();
  await row.hover();
  await row.locator(".menu__trigger").click();
  await page.getByRole("menuitem", { name: "SSH 配置…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("连接到 e2e-alpha");
  await expect(dialog).toContainText("用外部终端、VS Code 或 scp");
  await expect(dialog).toContainText("使用方法");
  await expect(dialog).toContainText("高级信息");
  // A healthy connection has no status row: no key name, no "running" badge.
  await expect(dialog).not.toContainText("外部连接会失败");
  await expect(dialog).not.toContainText("密钥 id_ed25519");

  // The label is the canonical file, not the long sandbox path; the block is
  // the one artifact, and a long ProxyCommand never turns into wrapped lines.
  await expect(dialog.locator(".code-block__label")).toHaveText("~/.ssh/config");
  const block = dialog.locator(".code-block__body");
  await expect(block).toContainText("Host colabdesk-e2e-alpha");
  await expect(block).toContainText('--proxy-mode -s "e2e-alpha"');
  await expect(block).toContainText("StrictHostKeyChecking no");

  await withClipboardLock(async () => {
    await dialog.getByRole("button", { name: "复制配置" }).click();
    await expect(dialog.getByRole("button", { name: "已复制" })).toBeVisible();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain(
      "Host colabdesk-e2e-alpha",
    );

    // The path chip is the canonical file, which is also what it copies.
    await dialog.getByRole("button", { name: "复制：~/.ssh/config" }).click();
    await expect(dialog.getByRole("button", { name: "已复制：~/.ssh/config" })).toBeVisible();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("~/.ssh/config");

    await dialog.getByRole("button", { name: "复制：ssh colabdesk-e2e-alpha" }).click();
    await expect(
      dialog.getByRole("button", { name: "已复制：ssh colabdesk-e2e-alpha" }),
    ).toBeVisible();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      "ssh colabdesk-e2e-alpha",
    );
  });

  await dialog.locator(".dialog__footer").getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
