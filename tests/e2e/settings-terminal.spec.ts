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

  await page.getByRole("button", { name: "Tokyo Night", exact: true }).click();

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
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
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
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("Connected");
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
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
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

  // Each chip scopes its own palette, so all ten can be read at once — and it
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

  expect(swatches).toHaveLength(10);
  for (const swatch of swatches) {
    expect(swatch.id, JSON.stringify(swatch)).not.toBe("");
    // A channel that never resolved would come back empty, and xterm would fill
    // it from its own light-background palette.
    expect(swatch.background, swatch.id).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatch.dim, swatch.id).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(new Set(swatches.map((swatch) => swatch.background)).size).toBe(10);
});

test("浅色槽位当场生效：关掉跟随就禁用，打开后再选它，画布跟着换", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await waitForPrompts(page, 1);
  await openTerminalSection(page);

  const follow = page.locator(".panel-row", { hasText: "跟随界面深浅" }).getByRole("checkbox");
  const light = page.getByRole("button", { name: "One Half Light" });

  // Following is the default, so the light slot is live out of the box.
  await expect(follow).toBeChecked();
  await expect(light).toBeEnabled();

  // Turning it off leaves the row visible but not choosable: "these exist, the
  // switch above is what turns them on" is the fact worth reading.
  await follow.uncheck();
  await expect(light).toBeDisabled();
  await expect(
    page.locator(".panel-row", { hasText: "浅色时用" }),
  ).toContainText("需先开启");

  await follow.check();
  await expect(light).toBeEnabled();
  await light.click();

  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-light"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  // #fafafa — One Half Light on a light window, in the sandbox and under it.
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(250, 250, 250)");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(250, 250, 250)");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
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

  await page.getByRole("button", { name: "One Half Light" }).click();
  await expect.poll(() => painted(page, ".terminal-area")).toBe("rgb(250, 250, 250)");
  await page.getByRole("button", { name: "增大字号" }).click();
  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");

  await reloadWorkbench(app, page);
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  await expect(page.locator('[data-testid="terminal-font-size"]')).toHaveText("14 px");
  await expect.poll(() => painted(page, ".terminal-preview")).toBe("rgb(250, 250, 250)");
});
