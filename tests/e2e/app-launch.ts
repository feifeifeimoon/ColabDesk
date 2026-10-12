/**
 * One Electron app per test, confined to its own throwaway HOME.
 *
 * `COLABDESK_E2E_MOCK=1` makes the app run against the in-process fakes in
 * `src/main/e2e/`: a stubbed CLI and a local SSH server behind a WebSocket
 * tunnel. No Google account, no runtime allocation, no Python — which is what
 * lets this suite run in a container. A fresh sandbox per test means nothing
 * leaks between them, and nothing touches the developer's real `~/.ssh` or
 * `~/.config/colab-cli`.
 */

import { _electron as electron, expect, test as base, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Playwright runs from where it was invoked; the suite is run from the root. */
export const projectRoot = process.cwd();

/** Electron needs these on a headless Linux container; they are inert elsewhere. */
const LINUX_FLAGS = ["--no-sandbox", "--disable-gpu", "--disable-gpu-compositing", "--disable-dev-shm-usage"];

interface Workbench {
  app: ElectronApplication;
  page: Page;
  sandbox: string;
}

export const test = base.extend<Workbench>({
  sandbox: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), "colabdesk-e2e-"));
    await use(directory);
    // Windows can hold the profile briefly after the process is gone.
    rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
  },

  app: async ({ sandbox }, use) => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    // Playwright's `_electron.launch` passes --remote-debugging-port, which a
    // process running as plain Node rejects.
    delete env.ELECTRON_RUN_AS_NODE;
    env.COLABDESK_E2E_MOCK = "1";
    env.COLABDESK_E2E_HOME = sandbox;

    const app = await electron.launch({
      args: [...(process.platform === "linux" ? LINUX_FLAGS : []), "--lang=zh-CN", projectRoot],
      env,
    });
    await use(app);
    await app.close();
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    // A crash in the renderer is otherwise invisible to a failing assertion.
    page.on("pageerror", (error) => console.log(`[renderer error] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.log(`[renderer console] ${message.text()}`);
    });
    await page.waitForLoadState("domcontentloaded");
    // Every spec starts from a painted workbench with its session list loaded.
    await waitForWorkbench(page);
    await use(page);
  },
});

export { expect };

/** The workbench chrome, painted and past the first data load. */
export async function waitForWorkbench(page: Page): Promise<void> {
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator('[data-testid="session-row"]').first()).toBeVisible();
}

/** Opens (or focuses) a session's tab from the left rail. */
export async function openSession(page: Page, name: string): Promise<void> {
  await page.locator(".session-row__main").filter({ hasText: name }).click();
}

/**
 * The rows of the terminal the user is looking at. Scoped to the visible host
 * so the locator keeps naming one pane the day several are mounted at once.
 */
export function terminalRows(page: Page): Locator {
  return page.locator(".terminal-host:visible .xterm-rows");
}

/**
 * Focuses the active terminal's input, the way clicking into it would.
 *
 * Verified rather than assumed: `focus()` is a DOM call that does nothing if
 * the element cannot take focus, and the keys typed afterwards would then land
 * on whatever still had it — a test that fails later, somewhere else.
 */
export async function focusTerminal(page: Page): Promise<void> {
  const input = page.locator(".terminal-host:visible .xterm-helper-textarea");
  await expect(async () => {
    await input.focus();
    expect(await page.evaluate(() => document.activeElement?.className ?? "")).toContain(
      "xterm-helper-textarea",
    );
  }).toPass({ timeout: 5_000 });
}

/** What the visible terminal shows, as its DOM renderer drew it. */
export function terminalText(page: Page): Promise<string> {
  return terminalRows(page).evaluate((element) => element.textContent ?? "");
}

/** Reloads through the app's own webContents: the renderer is a `file://` URL. */
export async function reloadWorkbench(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.reload();
  });
  await page.waitForLoadState("domcontentloaded");
  await waitForWorkbench(page);
}
