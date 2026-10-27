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

/**
 * How far the grid hangs out of its own box, in pixels. It should never be
 * positive: xterm sizes the grid in whole rows of a fixed height, from a box it
 * measures itself, and a row that does not fit is drawn *outside* the pane —
 * which is where the status bar is (see the workbench spec, which asserts the
 * same thing from the other side).
 */
async function gridOverhang(page: Page): Promise<number> {
  return page.evaluate(() => {
    const xterm = document.querySelector(".terminal-area:not([hidden]) .xterm");
    const screen = document.querySelector(".terminal-area:not([hidden]) .xterm-screen");
    if (!xterm || !screen) throw new Error("这个面板里没有终端网格");
    return Math.round(screen.getBoundingClientRect().bottom - xterm.getBoundingClientRect().bottom);
  });
}

/** Picking a palette: the row is the click target, its radio is visually hidden. */
function chooseTheme(page: Page, name: string): Promise<void> {
  return page.getByText(name, { exact: true }).click();
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
  // The palette that is live depends on the app's polarity, so pin it: what the
  // runner's desktop prefers is not this test's business, and the default is
  // "follow the system".
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-dark"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  const before = await painted(page, ".terminal-area");

  await chooseTheme(page, "Tokyo Night");

  // Both surfaces, and both through the same palette.
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(26, 27, 38)");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(26, 27, 38)");
  expect(before).not.toBe("rgb(26, 27, 38)");

  // And the frame's own boxes inside the pane, not just the pane: the grid is a
  // whole number of rows in a box that is not, so a sliver of what xterm paints
  // underneath is always exposed somewhere along an edge — and its own default
  // for that is black, which no palette here uses.
  await expect.poll(() => painted(page, ".terminal-area .xterm-viewport")).toBe("rgb(26, 27, 38)");

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveAttribute("data-connection", "ready");
  await expect(terminalRows(page)).toContainText("shell #1");

  // Same shell, still in the directory it was left in.
  await focusTerminal(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await terminalText(page)).split("/content/data").length - 1).toBeGreaterThanOrEqual(2);
});

test("切换界面语言不重连终端，正在运行的 shell 保持原样", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");
  await waitForPrompts(page, 2);

  // Where the shell stands is the thing a reconnect cannot preserve.
  await focusTerminal(page);
  await page.keyboard.type("cd /content/data");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await terminalText(page)).includes("/content/data")).toBe(true);

  // A language switch hands every mounted pane a new `t`. If the shell effect
  // depended on it, the old shell would be closed and `shell #2` would appear.
  await page.locator('[data-testid="open-settings"]').click();
  await page.getByRole("button", { name: "外观" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator(".settings__title")).toContainText("Appearance");

  await page.getByRole("button", { name: "Back to Workbench" }).click();
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveAttribute("data-connection", "ready");
  await expect(page.locator('[data-testid="terminal-count"]')).toHaveText("1");
  await expect(terminalRows(page)).toContainText("shell #1");
  await expect(terminalRows(page)).not.toContainText("shell #2");

  // Same shell, still in the directory it was left in.
  await focusTerminal(page);
  await page.keyboard.type("pwd");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await terminalText(page)).split("/content/data").length - 1)
    .toBeGreaterThanOrEqual(2);
  await expect(terminalRows(page)).not.toContainText("shell #2");
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
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveAttribute("data-connection", "ready");
  await expect(terminalRows(page)).toContainText("shell #1");
});

/*
  The ring around the terminal is a preference; the grid staying inside its own
  pane is not. It has been a real bug: the fit sized the grid from a box that
  included the ring while the CSS sized the pane without it, so every terminal
  drew one row more than it had room for — and that row landed on the status
  bar, because nothing clipped it. Measured at all three paddings, since the
  ring is what the two measurements disagreed about.
*/
test("光标样式与闪烁在预览里看得见", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await openTerminalSection(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const preview = page.locator(".terminal-preview");
  await preview.scrollIntoViewIfNeeded();
  const cursor = preview.locator(".xterm-cursor");

  // The sandbox never takes focus, so xterm would draw its inactive outline.
  // The preview wears the chosen shape anyway, on a line inside the frame.
  await expect(cursor).toHaveClass(/xterm-cursor-block/);
  await expect(cursor).toHaveCSS("animation-name", "terminal-preview-blink-block");

  const frame = await preview.boundingBox();
  const cell = await cursor.boundingBox();
  expect(frame).not.toBeNull();
  expect(cell).not.toBeNull();
  expect(cell!.y).toBeGreaterThanOrEqual(frame!.y - 1);
  expect(cell!.y + cell!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);

  await page.getByRole("button", { name: "竖线" }).click();
  await expect(cursor).toHaveClass(/xterm-cursor-bar/);
  await expect(cursor).toHaveCSS("animation-name", "terminal-preview-blink-bar");

  await page.getByRole("switch", { name: "光标闪烁" }).click();
  await expect(preview).toHaveAttribute("data-terminal-cursor-blink", "false");
  await expect(cursor).toHaveCSS("animation-name", "none");

  await page.getByRole("button", { name: "下划线" }).click();
  await expect(cursor).toHaveClass(/xterm-cursor-underline/);
});

test("字号调大后，预览仍从第一行开始，不被截断", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await openTerminalSection(page);

  const increase = page.getByRole("button", { name: "增大字号" });
  for (let i = 0; i < 11; i++) {
    if (await increase.isDisabled()) break;
    await increase.click();
  }
  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("24 px");

  const preview = page.locator(".terminal-preview");
  await preview.scrollIntoViewIfNeeded();

  // The prompt opens the sample; a sample that scrolls to the bottom loses the
  // top of the session, not just decoration.
  await expect(preview.locator(".xterm-rows > div").first()).toContainText("root@colab-v100");

  // And the cursor is still on a line inside the frame.
  const cursor = preview.locator(".xterm-cursor");
  await expect(cursor).toBeVisible();
  const frame = await preview.boundingBox();
  const cell = await cursor.boundingBox();
  expect(frame).not.toBeNull();
  expect(cell).not.toBeNull();
  expect(cell!.y + cell!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
});

test("三种内边距下，网格都装在自己的面板里", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");

  await openTerminalSection(page);

  for (const padding of ["紧凑", "舒适", "宽松"]) {
    await page.getByRole("button", { name: padding, exact: true }).click();
    await expect.poll(() => gridOverhang(page)).toBeLessThanOrEqual(0);
  }
});

test("十套调色板各自解析出颜色，且互不相同", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await openTerminalSection(page);

  // Pin the app's polarity so the section opens on the dark set; the light set
  // is one segment away. Only one set is on screen at a time.
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-dark"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  // Each row scopes its own palette, so the colour can be read off it — the
  // same mechanism (the attribute) the panes switch on.
  const readRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".theme-option")].map((row) => {
        const style = getComputedStyle(row);
        return {
          id: row.dataset.terminalTheme ?? "",
          background: style.getPropertyValue("--terminal-bg").trim(),
          dim: style.getPropertyValue("--terminal-ansi-bright-black").trim(),
        };
      }),
    );

  const dark = await readRows();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  const light = await readRows();
  const rows = [...dark, ...light];

  expect(rows).toHaveLength(10);
  for (const row of rows) {
    expect(row.id, JSON.stringify(row)).not.toBe("");
    // A channel that never resolved would come back empty, and xterm would fill
    // it from its own light-background palette.
    expect(row.background, row.id).toMatch(/^#[0-9a-f]{6}$/i);
    expect(row.dim, row.id).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(new Set(rows.map((row) => row.background)).size).toBe(10);
});

test("浅色配色直接生效，预览跟随正在编辑的一套", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);

  await openTerminalSection(page);
  // Pin the app light: the live slot is the light one, and the section opens on
  // that set.
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-light"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  // One set on screen: the three light palettes, no dark rows.
  await expect(page.locator(".theme-option")).toHaveCount(3);
  await chooseTheme(page, "One Half Light");

  // #fafafa — One Half Light on a light window, in the sandbox and under it.
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(250, 250, 250)");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(250, 250, 250)");

  // Editing the dark set previews it without touching the live terminal: the
  // sandbox wears the set being edited, the pane stays on the app's set.
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator(".theme-option")).toHaveCount(7);
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(10, 10, 10)");
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(250, 250, 250)");

  await expect(page.locator('[data-testid="terminal-status"]')).toHaveAttribute("data-connection", "ready");
});

test("配色与字号跨重启保留", async ({ app, page }) => {
  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page)).toContainText("shell #1");

  await openTerminalSection(page);
  // Which slot is live depends on the app's polarity, so pin it: the default is
  // "follow the system", and the runner's desktop is not this test's business.
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-light"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  await chooseTheme(page, "One Half Light");
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(250, 250, 250)");
  await page.getByRole("button", { name: "增大字号" }).click();
  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");

  await reloadWorkbench(app, page);
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(250, 250, 250)");
});
