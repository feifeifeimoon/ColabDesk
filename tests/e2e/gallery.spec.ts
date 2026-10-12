/**
 * Screenshots of the running app, for a person to look at.
 *
 * Tagged `@gallery` so the gate never runs it: nothing here asserts anything,
 * and the only consumer is an eye. That is also why there are no image
 * baselines to maintain — a picture is evidence in a review, not a test.
 *
 * It boots the app against the mock backend, so it needs no account, no
 * session and no Python.
 *
 * Run: npm run gallery   → screenshots/
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, openSession, test } from "./app-launch";

const directory = join(process.cwd(), "screenshots");
const SECTIONS = ["账号与额度", "用量趋势", "外观", "终端", "运行环境", "外部工具"];

/** Named by the theme actually on screen, never by what the harness meant. */
async function capture(page: Page, name: string): Promise<void> {
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "none");
  const file = join(directory, `${name}-${theme}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

test("@gallery 工作台与设置页截图", async ({ page }) => {
  test.slow();
  mkdirSync(directory, { recursive: true });

  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await page.waitForTimeout(800);

  await capture(page, "01-workbench");

  // Both panels collapsed is the terminal's full width — the focus mode.
  await page.locator('[data-testid="toggle-files"]').click();
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.waitForTimeout(600);
  await capture(page, "02-focus");
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.locator('[data-testid="toggle-files"]').click();

  // The session row's menu, the only place a runtime can be stopped.
  await page.locator(".session-row .menu__trigger").first().click();
  await page.waitForTimeout(400);
  await capture(page, "03-session-menu");
  await page.keyboard.press("Escape");

  await page.locator('[data-testid="open-settings"]').click();
  for (const theme of ["as-is", "other"] as const) {
    if (theme === "other") await page.locator('[data-testid="toggle-theme"]').click();
    for (const section of SECTIONS) {
      await page.locator(".settings__nav-item").filter({ hasText: section }).click();
      await page.waitForTimeout(500);
      await capture(page, `04-settings-${section}`);
    }
  }
});

/**
 * Seven terminal palettes, one shot each. The sandbox in the section is a real
 * terminal, so these are also the only pictures of how the 16 ANSI channels and
 * the ring around the canvas read — the reviewer's job, not a test's.
 */
test("@gallery 七套终端配色", async ({ page }) => {
  test.slow();
  mkdirSync(directory, { recursive: true });

  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  const palettes = [
    "Titanium",
    "Tokyo Night",
    "Catppuccin Mocha",
    "One Dark",
    "Dracula",
    "Nord",
    "Monokai",
  ];

  for (const palette of palettes) {
    await page.getByRole("button", { name: palette, exact: true }).click();
    await page.waitForTimeout(500);
    await capture(page, `05-terminal-${palette.split(" ")[0].toLowerCase()}`);
  }
});
