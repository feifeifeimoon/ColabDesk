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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, focusTerminal, openSession, reloadWorkbench, terminalRows, test } from "./app-launch";

const directory = join(process.cwd(), "screenshots");
const SECTIONS = ["外观", "终端", "快捷键", "外部连接", "账号与环境", "用量趋势", "关于"];

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

  // The start page first, because opening a session is the moment it leaves the
  // screen — and in both polarities, since the lockup is ink and ink flips.
  await capture(page, "00-start-page");
  await toggleTheme(page);
  await capture(page, "00-start-page");
  await toggleTheme(page);

  // And once in English: the front door is the one screen that is almost all
  // words, so it is where a translation shows its seams.
  await page.evaluate(() => localStorage.setItem("colabdesk.language", "en"));
  await reloadWorkbench(app, page);
  await capture(page, "00-start-page-en");
  await page.evaluate(() => localStorage.setItem("colabdesk.language", "zh"));
  await reloadWorkbench(app, page);

  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveAttribute("data-connection", "ready");
  await page.waitForTimeout(800);

  await capture(page, "01-workbench");

  // The rail's cards are made of two surfaces, so the workbench is worth a
  // picture in both polarities — the light one alone would not show the card.
  await toggleTheme(page);
  await capture(page, "01-workbench");
  await toggleTheme(page);

  // Both panels collapsed is the terminal's full width — the focus mode.
  await page.locator('[data-testid="toggle-files"]').click();
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.waitForTimeout(600);
  await capture(page, "02-focus");
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.locator('[data-testid="toggle-files"]').click();

  // The session row's menu, the only place a runtime can be stopped. The row's
  // actions appear when it is pointed at, which is also how they are used.
  const firstRow = page.locator('[data-testid="session-row"]').first();
  await firstRow.hover();
  await firstRow.locator(".menu__trigger").click();
  await page.waitForTimeout(400);
  await capture(page, "03-session-menu");
  await page.keyboard.press("Escape");

  // The result of that menu's least destructive item: a message in the corner
  // that leaves on its own. Nothing else on screen changes, which is the point
  // of it — the workbench underneath is a live terminal.
  await firstRow.hover();
  await firstRow.locator(".menu__trigger").click();
  await page.getByRole("menuitem", { name: "复制 ssh 命令" }).click();
  await expect(page.locator(".toasts .toast")).toContainText("已复制");
  await page.waitForTimeout(400);
  await capture(page, "03-toast");
  await page.locator('[data-testid="toast-dismiss"]').click();

  // The runtime-setup console: the one screen that wears the terminal's own
  // palette, so the picture is where "a console, not a form" is judged.
  await page.locator('[aria-label="新建会话"]').click();
  const setup = page.locator('[data-testid="runtime-setup"]');
  await expect(setup).toBeVisible();
  await page.waitForTimeout(400);
  await capture(page, "04-runtime-setup");

  // The failure state: the app has to say what went wrong in the window, not in
  // a file — the reason is the CLI's own last turn of phrase, and 「复制详情」
  // hands the whole output over. The name is one that already exists, so it
  // fails. The answers stay on screen and the log is appended below them.
  await setup.locator("input[type=text]").fill("e2e-alpha");
  await setup.getByRole("button", { name: "创建" }).click();
  await expect(setup.locator('[data-testid="setup-error"]')).toBeVisible();
  await page.waitForTimeout(400);
  await capture(page, "04-runtime-setup-failed");

  await page.keyboard.press("Escape");

  // The tree, with a folder open and a row's context menu out: the row is the
  // whole click target, right-click asks what can be done, and the indent is
  // what says where a file is. All three are judgments a picture answers and a
  // test cannot.
  const dataRow = page.locator(".file-row").filter({ hasText: "data" });
  await dataRow.locator(".file-row__row").click();
  await page.waitForTimeout(400);
  await capture(page, "07-file-tree");
  await page.locator(".file-row").filter({ hasText: "model.pt" }).click({ button: "right" });
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
  await expect(page.getByRole("tab", { name: "README.txt" }).locator(".session-tab__dot")).toBeVisible();
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

  // The rendered side of a Markdown file, which the source editor cannot show:
  // headings, emphasis and fenced code as the document, not as syntax.
  await page.locator(".file-row").filter({ hasText: "README.md" }).locator(".file-row__row").dblclick();
  const markdownPane = page.locator('.file-area[aria-label="README.md"]');
  await markdownPane.locator('[data-testid="markdown-view-rich"]').click();
  await expect(markdownPane.locator(".rich-markdown-content h1")).toContainText("ColabDesk runtime guide");
  await expect(markdownPane.getByRole("toolbar", { name: "格式" })).toBeVisible();
  await markdownPane.locator(".rich-markdown-content").click();
  await page.waitForTimeout(400);
  await capture(page, "08-markdown-rich");
  await page.getByRole("button", { name: "关闭 README.md" }).click();

  // Leave the strip the way the later shots expect to find it. The edited tab
  // goes through its own question — which is also the only place the close
  // guard would show up in a run of the gallery.
  await page.getByRole("button", { name: "关闭 train.log" }).click();
  await page.getByRole("button", { name: "关闭 README.txt" }).click();
  await expect(page.getByRole("dialog", { name: "关闭「README.txt」？" })).toBeVisible();
  await page.waitForTimeout(300);
  await capture(page, "09-unsaved-dialog");
  await readmePane.getByRole("button", { name: "不保存" }).click();
  await expect(page.getByRole("tab", { name: "README.txt" })).toHaveCount(0);

  await page.locator('[data-testid="open-settings"]').click();
  for (const theme of ["as-is", "other"] as const) {
    if (theme === "other") await toggleTheme(page);
    for (const section of SECTIONS) {
      await page.locator(".settings__nav-item").filter({ hasText: section }).click();
      await page.waitForTimeout(500);
      await capture(page, `06-settings-${section}`);
    }
  }
});

/**
 * The app's states in English, for review.
 *
 * The gate's fixture pins the interface to Chinese so assertions never read the
 * host locale; these shots are for an English-reading audience, so this run
 * flips the language the way a user does and shoots the same states. Both
 * galleries come out of the one command.
 *
 * The site no longer reads `screenshots/`: its one picture is the curated
 * T4/vLLM hero (`site/assets/hero.png`), which the mock cannot reproduce.
 */
test("@gallery English shots", async ({ app, page, sandbox }) => {
  test.slow();
  mkdirSync(directory, { recursive: true });

  await page.evaluate(() => localStorage.setItem("colabdesk.language", "en"));
  await reloadWorkbench(app, page);

  // The chart's whole point is a curve, and a fresh sandbox has no readings.
  // Daily samples give it one: each drop between two samples is what is drawn,
  // and the pace varies so the bars read as real days rather than a ruler.
  const spends = Array.from({ length: 31 }, (_, day) => 0.4 + (((day * 7) % 13) / 12) * 2.2);
  let balance = 42.5 + spends.slice(1).reduce((sum, spend) => sum + spend, 0);
  const firstDay = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const samples = spends.map((_, day) => {
    if (day > 0) balance -= spends[day];
    return JSON.stringify({
      at: new Date(firstDay + day * 24 * 60 * 60 * 1000).toISOString(),
      balance: Number(balance.toFixed(3)),
      rate: 1.25,
      assignments: day % 7 === 0 ? 2 : 1,
    });
  });
  writeFileSync(join(sandbox, "user-data", "usage-history.jsonl"), `${samples.join("\n")}\n`);

  await openSession(page, "e2e-alpha");
  await expect(terminalRows(page).first()).toContainText("e2e-alpha");
  await page.waitForTimeout(800);

  // A prompt alone is a picture of nothing; a few real commands are what makes
  // the terminal read as a terminal, and a second tab is what the feature is
  // actually about.
  await focusTerminal(page);
  for (const command of ["ls", "uname", "pwd"]) {
    await page.keyboard.type(command);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  }
  await page.locator('[data-testid="new-terminal"]').click();
  await page.waitForTimeout(800);
  // Back to the tab with the commands in it: two tabs, one of them worked in.
  await page.locator(".session-tab").filter({ hasText: "Terminal 1" }).click();
  await page.waitForTimeout(500);

  // The dark one is the site's hero; the light ones sit in the feature rows.
  await toggleTheme(page);
  await capture(page, "01-workbench-en");
  await toggleTheme(page);
  await capture(page, "01-workbench-en");

  await page.locator('[data-testid="toggle-files"]').click();
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.waitForTimeout(600);
  await capture(page, "02-focus-en");
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.locator('[data-testid="toggle-files"]').click();

  await page.locator(".file-row").filter({ hasText: "data" }).locator(".file-row__row").click();
  await page.waitForTimeout(400);
  await capture(page, "07-file-tree-en");

  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "Usage Trend" }).click();
  await page.waitForTimeout(500);
  await capture(page, "06-settings-usage-en");
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

  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveAttribute("data-connection", "ready");
  await page.locator('[data-testid="open-settings"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();

  // One set at a time, the way the section edits them; the preview is forced to
  // the set being edited, so each shot shows the palette even when the app's
  // own polarity is the other one. The sandbox sits below the type panel, so the
  // shot scrolls to it: the palette itself is what the file is named for.
  const sets = [
    {
      mode: "深色",
      palettes: [
        "Titanium",
        "Tokyo Night",
        "Catppuccin Mocha",
        "One Dark",
        "Dracula",
        "Nord",
        "Monokai",
      ],
    },
    {
      mode: "浅色",
      palettes: ["Catppuccin Latte", "One Half Light", "Tokyo Night Light"],
    },
  ] as const;

  for (const set of sets) {
    await page.getByRole("button", { name: set.mode, exact: true }).click();
    for (const palette of set.palettes) {
      await page.getByText(palette, { exact: true }).click();
      await page.waitForTimeout(500);
      await page.locator(".terminal-preview").scrollIntoViewIfNeeded();
      // The whole name: "Catppuccin Latte" and "Catppuccin Mocha" would otherwise
      // land on one file, and a shot that silently overwrites another is worse
      // than no shot.
      const slug = palette.toLowerCase().replace(/\s+/g, "-");
      await capture(page, `05-terminal-${slug}`);
    }
  }

  // And the combination the feature exists for: a light app with the light
  // palette it follows into.
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-light"]').click();
  await page.locator(".settings__nav-item").filter({ hasText: "终端" }).click();
  await page.waitForTimeout(500);
  await page.locator(".terminal-preview").scrollIntoViewIfNeeded();
  await capture(page, "06-terminal-light-following");

  // The sample is chosen by the grid: at the largest type it switches to the
  // short variant from the dots line instead of scrolling the top away.
  const increase = page.getByRole("button", { name: "增大字号" });
  while (!(await increase.isDisabled())) await increase.click();
  await page.locator(".terminal-preview").scrollIntoViewIfNeeded();
  await capture(page, "06-terminal-large-type");
});

/**
 * The staged start screen, for review.
 *
 * The README's hero is a curated screenshot of a real T4/vLLM session
 * (`docs/assets/hero.png`); the mock has no vLLM server or GPU, so it cannot
 * reproduce that state, and this run must not overwrite it. What is checked
 * here is the staging technique: two plausible sessions in the sandbox's own
 * store, with the fixture's untracked row kept out of the rail.
 */
test("@gallery staged start screen", async ({ app, page, sandbox }) => {
  const store = join(sandbox, ".config", "colab-cli", "sessions.json");
  const seeded = JSON.parse(readFileSync(store, "utf8")) as Record<string, Record<string, unknown>>;
  const entries = Object.values(seeded);

  /*
    Two plausible sessions. One takes the endpoint the double always reports as
    untracked, so that row (whose endpoint is obviously a fixture) stays out of
    the picture; the rest of each entry — token, url, kernel — is the stub's own,
    so nothing here invents runtime behaviour.
  */
  writeFileSync(
    store,
    JSON.stringify(
      {
        "llama-finetune": { ...entries[0], endpoint: "m-s-kkb-usc1c1-1ysqo4pb8zt5n", accelerator: "A100" },
        "data-prep": { ...entries[1], endpoint: "m-s-kkb-e2e0c1-untracked", accelerator: "T4" },
      },
      null,
      2,
    ),
  );

  await page.evaluate(() => {
    localStorage.setItem("colabdesk.language", "en");
    localStorage.setItem("colabdesk.theme", "light");
  });
  await reloadWorkbench(app, page);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 940);
  });
  await page.waitForTimeout(700);

  // It is the start screen with the staged rail — checked, not assumed.
  await expect(page.locator(".startpage")).toBeVisible();
  await expect(page.locator('[data-testid="session-row"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="sidebar-list"]')).toContainText("llama-finetune");
  await expect(page.locator('[data-testid="sidebar-list"]')).toContainText("data-prep");
  await expect(page.locator('[data-testid="untracked-row"]')).toHaveCount(0);

  const output = join(directory, "00-start-page-staged.png");
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: output });
  console.log(output);
});
