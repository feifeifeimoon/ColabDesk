/**
 * The terminal's appearance, driven the way a user drives it.
 *
 * Two claims are worth a browser: that changing a colour or a size never
 * disturbs the shell (a reconnect would show up as a new `shell #N` and a fresh
 * working directory), and that the colour actually reaches the pixels — asserted
 * as the computed background of the surface the user is looking at, since for a
 * colour feature that *is* the user-visible fact.
 *
 * Assertions stay on what is on screen: nothing here reads the store.
 */

import type { Locator, Page } from "@playwright/test";
import {
  expect,
  focusTerminal,
  openSession,
  reloadWorkbench,
  terminalRows,
  terminalText,
  test,
} from "./app-launch";

const PROMPT = "root@e2e-runtime:";

/** The surface behind the terminal, as painted. */
function painted(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}

/** The active pane's own rows — the settings sandbox is a `.terminal-host` too. */
function paneRows(page: Page): Locator {
  return page.locator(".terminal-area:visible .xterm-rows > div");
}

async function openTerminalSection(page: Page): Promise<void> {
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();
}

/** Waits until the shell has answered `times` commands, counting prompts. */
async function waitForPrompts(page: Page, times: number): Promise<void> {
  await expect
    .poll(async () => (await terminalText(page)).split(PROMPT).length - 1)
    .toBeGreaterThanOrEqual(times);
}

test("换配色当场生效：沙箱与工作台一起换，shell 不受影响", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");
  await waitForPrompts(page, 2);

  // Where it is standing is the only thing a reconnect could not preserve.
  await focusTerminal(page);
  await page.keyboard.type("cd /content/data");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await terminalText(page)).includes("/content/data")).toBe(true);

  await openTerminalSection(page);
  await expect(page.locator(".terminal-preview")).toBeVisible();
  const before = await painted(page, ".terminal-area");

  await page.getByRole("button", { name: "Tokyo Night" }).click();

  // Both surfaces, and both through the same palette.
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(26, 27, 38)");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(26, 27, 38)");
  expect(before).not.toBe("rgb(26, 27, 38)");

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await expect(terminalRows(page)).toContainText("shell #1");

  // Same shell, still in the directory it was left in.
  await focusTerminal(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await terminalText(page)).split("/content/data").length - 1).toBeGreaterThanOrEqual(2);
});

test("改字号与行高会重排网格，但不动连接、也不抢走设置的键盘", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");
  await waitForPrompts(page, 2);

  await openTerminalSection(page);
  const rows = await paneRows(page).count();

  await page.getByRole("button", { name: "增大字号" }).click();
  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");

  // Bigger type, fewer rows in the same height — the pane really was re-measured.
  await expect.poll(() => paneRows(page).count()).toBeLessThan(rows);

  // The keyboard stays with settings: focusing the covered terminal would send
  // what the user types next into a pane they cannot see.
  expect(await page.evaluate(() => document.activeElement?.className ?? "")).not.toContain(
    "xterm-helper-textarea",
  );

  await page.getByRole("button", { name: "1.35 宽松" }).click();
  await expect.poll(() => paneRows(page).count()).toBeLessThan(rows);

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await expect(terminalRows(page)).toContainText("shell #1");
});

test("七套调色板各自解析出颜色，且互不相同", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await openTerminalSection(page);

  // Each chip scopes its own palette, so all seven can be read at once — and it
  // is the same mechanism (the attribute) the panes switch on.
  const swatches = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".terminal-swatch")].map((chip) => {
      const style = getComputedStyle(chip);
      return {
        id: chip.dataset.terminalTheme ?? "",
        background: style.getPropertyValue("--terminal-bg").trim(),
        dim: style.getPropertyValue("--terminal-ansi-bright-black").trim(),
      };
    }),
  );

  expect(swatches).toHaveLength(7);
  for (const swatch of swatches) {
    expect(swatch.id, JSON.stringify(swatch)).not.toBe("");
    // A channel that never resolved would come back empty, and xterm would fill
    // it from its own light-background palette.
    expect(swatch.background, swatch.id).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatch.dim, swatch.id).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(new Set(swatches.map((swatch) => swatch.background)).size).toBe(7);
});

test("配色与字号跨重启保留", async ({ app, page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");

  await openTerminalSection(page);
  await page.getByRole("button", { name: "Nord" }).click();
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(46, 52, 64)");
  await page.getByRole("button", { name: "增大字号" }).click();
  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");

  await reloadWorkbench(app, page);
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(46, 52, 64)");
});
