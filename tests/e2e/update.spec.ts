/**
 * The update path, end to end, against the fake backend.
 *
 * electron-updater cannot be driven from a container — its Linux implementation
 * is AppImage-only and refuses to run without an `APPIMAGE` — so the backend is
 * replaced (`src/main/e2e/update-backend.ts`) and everything above it stays the
 * production path: the same state machine, the same IPC, the same screens. What
 * this asserts is that those states reach somewhere a person can see them,
 * which is the part no unit test covers.
 */

import type { Page } from "@playwright/test";
import { expect, reloadWorkbench, test } from "./app-launch";

/** Opens settings on the 关于 section, whichever way in you take. */
async function openAbout(page: Page): Promise<void> {
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item", { hasText: "关于" }).click();
}

test.describe("有新版本时", () => {
  test.use({ updateVersion: "9.9.9" });

  test("在工作台提示，并让状态栏指出它", async ({ page }) => {
    const banner = page.locator('[data-testid="update-banner"]');
    await expect(banner).toContainText("9.9.9");
    await expect(page.locator('[data-testid="statusbar-update"]')).toBeVisible();
  });

  test("下载完成后只提供重启，不再提供下载", async ({ page }) => {
    await page.locator('[data-testid="update-banner-download"]').click();

    await expect(page.locator('[data-testid="update-banner-install"]')).toBeVisible();
    await expect(page.locator('[data-testid="update-banner-download"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="update-banner"]')).toContainText("重启后生效");
  });

  test("点状态栏那一段，落到设置页的关于节", async ({ page }) => {
    await page.locator('[data-testid="statusbar-update"]').click();
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();
    // Not merely "settings opened": the rail had to come up on 关于, which is
    // the whole reason the segment is worth clicking.
    await expect(page.locator('[data-testid="update-status"]')).toContainText("9.9.9");
  });

  test("在关于节里检查一次，仍然报出同一个版本", async ({ page }) => {
    await openAbout(page);
    await expect(page.locator('[data-testid="update-status"]')).toContainText("9.9.9");
    // No second check button: with a build already waiting, downloading is the
    // action, and a "check again" next to it would only be a way to lose it.
    await expect(page.locator('[data-testid="update-check"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="update-download"]')).toBeVisible();
  });

  test("知道了之后当次会话不再打扰", async ({ app, page }) => {
    await page.locator('[data-testid="update-banner-dismiss"]').click();
    await expect(page.locator('[data-testid="update-banner"]')).toHaveCount(0);

    // Dismissal is per session, not per install: the update is still pending,
    // so the next launch mentions it once and then stays quiet again.
    await reloadWorkbench(app, page);
    await expect(page.locator('[data-testid="update-banner"]')).toContainText("9.9.9");
  });
});

test.describe("没有新版本时", () => {
  test("不打扰用户", async ({ page }) => {
    await expect(page.locator('[data-testid="update-banner"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="statusbar-update"]')).toHaveCount(0);

    await openAbout(page);
    await page.locator('[data-testid="update-check"]').click();
    await expect(page.locator('[data-testid="update-status"]')).toContainText("已是最新版本");
  });
});
