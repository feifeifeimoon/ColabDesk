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
import { expect, focusTerminal, openSession, reloadWorkbench, test } from "./app-launch";

const directory = join(process.cwd(), "screenshots");

/** Named by the theme actually on screen, never by what the harness meant. */
async function capture(page: Page, name: string): Promise<void> {
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "none");
  const file = join(directory, `${name}-${theme}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

/**
 * Flips the theme and waits for it to have flipped.
 *
 * A click can be dropped on this machine's compositor, and the cost here is not
 * a failure but a *missing* picture: the second shot would come back named after
 * the polarity it already had. Retrying the click is what makes the pair of
 * shots a pair. The settle afterwards is for the buttons' 120ms cross-fade —
 * without it the shot lands on a colour that is nobody's.
 */
async function toggleTheme(page: Page): Promise<void> {
  const current = () => page.evaluate(() => document.documentElement.dataset.theme);
  const before = await current();
  const next = before === "dark" ? "light" : "dark";
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("colabdesk.theme", theme);
  }, next);
  await expect(async () => {
    expect(await current()).not.toBe(before);
  }).toPass({ timeout: 5_000 });
  await page.waitForTimeout(400);
}

test("@gallery 工作台与设置页截图", async ({ app, page }) => {
  test.slow();
  mkdirSync(directory, { recursive: true });

  // Set language to English so all screenshots reflect the global/English UI.
  await page.evaluate(() => localStorage.setItem("colabdesk.language", "en"));
  await reloadWorkbench(app, page);

  // The start page in English
  await capture(page, "00-start-page");
  await toggleTheme(page);
  await capture(page, "00-start-page");
  await toggleTheme(page);

  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText(/Connected|已连接/);
  await page.waitForTimeout(800);

  // Focus terminal and run vLLM inference server
  await focusTerminal(page);
  await page.waitForTimeout(400);
  await page.keyboard.type("vllm serve meta-llama/Meta-Llama-3-8B-Instruct --gpu-memory-utilization 0.90");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);

  // Workbench showing vLLM inference logs in both polarities
  await capture(page, "01-workbench");
  await toggleTheme(page);
  await capture(page, "01-workbench");
  await toggleTheme(page);

  // Both panels collapsed is the terminal's full width — the focus mode.
  await page.locator('[data-testid="toggle-files"]').click();
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.waitForTimeout(600);
  await capture(page, "02-focus");
  await toggleTheme(page);
  await capture(page, "02-focus");
  await toggleTheme(page);
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.locator('[data-testid="toggle-files"]').click();

  // The session row's menu, the only place a runtime can be stopped.
  await page.locator(".session-row .menu__trigger").first().click();
  await page.waitForTimeout(400);
  await capture(page, "03-session-menu");
  await toggleTheme(page);
  await capture(page, "03-session-menu");
  await toggleTheme(page);
  await page.keyboard.press("Escape");

  // The result of that menu's least destructive item: a message in the corner
  // that leaves on its own. Nothing else on screen changes, which is the point
  // of it — the workbench underneath is a live terminal.
  await page.locator(".session-row .menu__trigger").first().click();
  await page.getByRole("menuitem", { name: /Copy ssh command|复制 ssh 命令/i }).click();
  await expect(page.locator(".toasts .toast")).toBeVisible();
  await page.waitForTimeout(400);
  await capture(page, "03-toast");
  await page.locator('[data-testid="toast-dismiss"]').click();

  // The dialog is the one surface whose exit is a bare icon, so it is the shot
  // that answers whether an × with no word beside it still reads as "close".
  await page.locator('[aria-label="New session"], [aria-label="新建会话"]').click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  await capture(page, "04-new-session");

  // The failure state: the app has to say what went wrong in the window, not in
  // a file — the reason is the CLI's own last line, and 「复制详情」 hands the
  // whole output over. The name is one that already exists, so it fails.
  await dialog.getByLabel(/Session Name|会话名称/i).fill("e2e-alpha");
  await dialog.getByRole("button", { name: /Create|创建/i }).click();
  await expect(dialog.locator(".callout--danger")).toBeVisible();
  await page.waitForTimeout(400);
  await capture(page, "04-new-session-failed");

  await dialog.getByRole("button", { name: /Close|关闭/i }).click();

  // The tree, with a folder open and a row's menu out: the row is the whole
  // click target, its actions are one trigger, and the indent is what says
  // where a file is. All three are judgments a picture answers and a test
  // cannot.
  const dataRow = page.locator(".file-row").filter({ hasText: "data" });
  await dataRow.locator(".file-row__row").click();
  await page.waitForTimeout(400);
  await capture(page, "07-file-tree");
  await page
    .locator(".file-row")
    .filter({ hasText: "model.pt" })
    .getByRole("button")
    .click();
  await page.waitForTimeout(400);
  await capture(page, "07-file-row-menu");
  await page.keyboard.press("Escape");

  // A file as a tab. Its body is CodeMirror's surface, so the picture answers
  // what no assertion can: whether a document reads as part of this workbench
  // next to a live terminal, rather than as another program's window.
  await page.locator(".file-row").filter({ hasText: "README.txt" }).locator(".file-row__row").dblclick();
  const readmePane = page.locator('.file-area[aria-label="README.txt"]');
  await expect(page.getByRole("tab", { name: "README.txt" })).toBeVisible();
  await page.waitForTimeout(500);
  await capture(page, "08-file-tab");

  // …and with an edit in it: the dot on the tab, the state line, the save. What
  // a picture answers here is whether "unsaved" reads without colour.
  await readmePane.locator(".cm-content").click();
  await page.keyboard.type("edited in the gallery");
  await expect(readmePane).toContainText(/Unsaved|未保存/);
  await page.waitForTimeout(400);
  await capture(page, "08-file-tab-edited");

  // …and the oversized one, where two excerpts and a stated gap are the design:
  // whether that reads as one document or as three is a judgment, not a test.
  // The jump is made with the editor's own find — "MB" occurs only on the
  // marker line — so the picture is of the line the design is about rather than
  // of wherever a `scrollTop` write happened to land.
  await page.locator(".file-row").filter({ hasText: "train.log" }).locator(".file-row__row").dblclick();
  const logPane = page.locator('.file-area[aria-label="train.log"]');
  await expect(logPane.locator(".cm-content")).toContainText("training begins");
  await logPane.locator(".cm-content").click();
  await page.keyboard.press("Control+f");
  await page.keyboard.type("MB");
  await page.keyboard.press("Enter");
  await expect(logPane.locator(".cm-searchMatch")).toHaveCount(1);
  await page.waitForTimeout(500);
  await capture(page, "08-file-tab-truncated");
  await page.keyboard.press("Escape");

  // Leave the strip the way the later shots expect to find it. The edited tab
  // goes through its own question — which is also the only place the close
  // guard would show up in a run of the gallery.
  await page.getByRole("button", { name: /Close train\.log|关闭 train\.log/i }).click();
  await page.getByRole("button", { name: /Close README\.txt|关闭 README\.txt/i }).click();
  await readmePane.getByRole("button", { name: /Don't save|不保存/i }).click();
  await expect(page.getByRole("tab", { name: "README.txt" })).toHaveCount(0);

  const SETTING_SECTIONS = [
    { label: /Account & Quota|账号与额度/i, slug: "account" },
    { label: /Usage Trend|用量趋势/i, slug: "usage" },
    { label: /Appearance|外观/i, slug: "appearance" },
    { label: /Terminal|终端/i, slug: "terminal" },
    { label: /Environment|运行环境/i, slug: "environment" },
    { label: /External Tools|外部工具/i, slug: "external" },
    { label: /About|关于/i, slug: "about" },
  ];

  await page.locator('[data-testid="open-settings"]').click();
  for (const theme of ["as-is", "other"] as const) {
    if (theme === "other") await toggleTheme(page);
    for (const section of SETTING_SECTIONS) {
      await page.locator(".settings__nav-item").filter({ hasText: section.label }).click();
      await page.waitForTimeout(500);
      await capture(page, `06-settings-${section.slug}`);
      if (section.slug === "usage") await capture(page, "06-settings-用量趋势");
      if (section.slug === "external") await capture(page, "06-settings-外部工具");
    }
  }
});

/**
 * The ten terminal palettes, one shot each. The sandbox in the section is a real
 * terminal, so these are also the only pictures of how the 16 ANSI channels and
 * the ring around the canvas read — the reviewer's job, not a test's.
 *
 * The three light ones are also shot with the app flipped light, since a palette
 * only shows on the workbench when its polarity is the one in force.
 */
test("@gallery 十套终端配色", async ({ page }) => {
  test.slow();
  mkdirSync(directory, { recursive: true });

  await page.evaluate(() => localStorage.setItem("colabdesk.language", "en"));
  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText(/Connected|已连接/);
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: /Terminal|终端/ }).click();

  const palettes = [
    "Titanium",
    "Tokyo Night",
    "Catppuccin Mocha",
    "One Dark",
    "Dracula",
    "Nord",
    "Monokai",
    "Catppuccin Latte",
    "One Half Light",
    "Tokyo Night Light",
  ];

  for (const palette of palettes) {
    await page.getByRole("button", { name: palette, exact: true }).click();
    await page.waitForTimeout(500);
    // The whole name: "Catppuccin Latte" and "Catppuccin Mocha" would otherwise
    // land on one file, and a shot that silently overwrites another is worse
    // than no shot.
    const slug = palette.toLowerCase().replace(/\s+/g, "-");
    await capture(page, `05-terminal-${slug}`);
  }

  // And the combination the feature exists for: a light app with the light
  // palette it follows into.
  await page.getByRole("button", { name: /Appearance|外观/ }).click();
  await page.locator('[data-testid="theme-choice-light"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: /Terminal|终端/ }).click();
  await page.waitForTimeout(500);
  await capture(page, "06-terminal-light-following");
});
