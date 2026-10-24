/**
 * The two rails: draggable, remembered, keyboard-adjustable, and never at the
 * terminal's expense.
 *
 * The drag is driven through the real pointer pipeline, which is also what
 * proves the strip keeps hold of it — a terminal canvas underneath would
 * otherwise swallow the release and leave the rail following the cursor.
 */

import type { Page } from "@playwright/test";
import { expect, openSession, reloadWorkbench, terminalRows, test } from "./app-launch";

/**
 * What the bar spends on the macOS traffic lights before its first control
 * (`AppShell`'s MAC_INSET). The bar's sections are the window's columns, so
 * this is the one place the layout starts further right than the row below.
 */
const CHROME_INSET = process.platform === "darwin" ? 78 : 0;

async function widthOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} 没有布局盒`);
  return box.width;
}

/** The rails are in the accessibility tree; a parked tab's are not. */
function divider(page: Page, name: string) {
  return page.getByRole("separator", { name });
}

async function dragDivider(page: Page, name: string, dx: number): Promise<void> {
  const box = await divider(page, name).boundingBox();
  if (!box) throw new Error(`找不到分隔条：${name}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
}

test("拖动分隔条改变会话栏宽度", async ({ page }) => {
  const before = await widthOf(page, ".sidebar");
  expect(before).toBeCloseTo(260, 0);

  await dragDivider(page, "会话栏宽度", 90);

  expect(await widthOf(page, ".sidebar")).toBeGreaterThan(before + 60);
});

test("拖出来的宽度跨重载保留", async ({ app, page }) => {
  await dragDivider(page, "会话栏宽度", 70);
  const dragged = Math.round(await widthOf(page, ".sidebar"));

  await reloadWorkbench(app, page);

  expect(Math.round(await widthOf(page, ".sidebar"))).toBe(dragged);
});

test("分隔条可用键盘调整，并把范围报给辅助技术", async ({ page }) => {
  const handle = divider(page, "会话栏宽度");
  await expect(handle).toHaveAttribute("aria-valuemin", "180");
  await expect(handle).toHaveAttribute("aria-valuemax", "420");

  const before = await widthOf(page, ".sidebar");
  await handle.focus();
  await page.keyboard.press("ArrowRight");

  expect(await widthOf(page, ".sidebar")).toBeGreaterThan(before);
});

/*
  The rail is draggable precisely so it can be pushed out of the terminal's way.
  The first line now carries the name and the machine-type badge; at the 180px
  floor the badge takes precedence and a long name may truncate. The row's
  tooltip is the safety net: it carries the full name, endpoint and state.
*/
test("会话栏收到最窄时，名字让位给机型 tag，完整名字在 tooltip 里", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  const rows = page.locator('[data-testid="session-row"]');
  const row = rows.filter({ hasText: "e2e-alpha" }).first();
  const name = row.locator(".session-row__name");

  // 默认宽度下名字是完整的。
  await expect(name).toHaveText("e2e-alpha");
  expect(
    await name.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);

  await dragDivider(page, "会话栏宽度", -600);
  expect(await widthOf(page, ".sidebar")).toBeCloseTo(180, 0);

  await expect(rows).toHaveCount(2);
  await expect(row.locator(".session-row__badge .badge")).toHaveText("T4");
  await expect(row).toHaveAttribute("title", /e2e-alpha/);
  await expect(row).toHaveAttribute("title", /云端运行中/);
  await expect(row).toHaveAttribute("title", /已连接/);
});

test("分隔条静息时不画线，指向它才亮起来", async ({ page }) => {
  const handle = divider(page, "会话栏宽度");
  const lineColour = (): Promise<string> =>
    handle.evaluate((element) => getComputedStyle(element, "::after").backgroundColor);

  expect(await lineColour()).toBe("rgba(0, 0, 0, 0)");
  await handle.hover();
  expect(await lineColour()).not.toBe("rgba(0, 0, 0, 0)");
});

test("会话菜单只留不重复的操作，每项都有图标", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  const row = page.locator('[data-testid="session-row"]').first();
  await row.hover();
  await row.locator(".menu__trigger").click();

  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(5);
  for (const label of ["重启内核", "写入 SSH 配置", "复制 ssh 命令", "关闭全部标签", "停止会话"]) {
    await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
  }
  // Clicking the row and + already do these; the menu does not repeat them.
  await expect(page.getByRole("menuitem", { name: "聚焦终端" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "打开终端" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "新建终端" })).toHaveCount(0);
  await expect(page.locator(".menu__separator")).toHaveCount(1);
  await expect(items.locator("svg")).toHaveCount(5);
});

test("两栏都拖到最宽时，终端还在、仍可用且不横向溢出", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveClass(/status--good/);

  await dragDivider(page, "文件面板宽度", -600);
  await dragDivider(page, "会话栏宽度", 600);

  // Dragging re-fits the terminal continuously, which resizes the PTY too: the
  // connection has to survive that, not just the layout.
  await expect(page.locator('[data-testid="terminal-status"]')).toHaveClass(/status--good/);
  await expect(terminalRows(page)).not.toContainText("连接已断开");

  expect(await widthOf(page, ".terminal-area")).toBeGreaterThanOrEqual(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("标签条从终端正上方开始，跟着会话栏走", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  /** How far the strip's left edge sits from the terminal's. */
  const drift = async (): Promise<number> => {
    const strip = await page.locator(".topbar__tabs").boundingBox();
    const terminal = await page.locator(".terminal-area").boundingBox();
    if (!strip || !terminal) throw new Error("没有布局盒");
    return Math.abs(strip.x - terminal.x);
  };

  expect(await drift()).toBeLessThanOrEqual(1);

  // The bar is divided the way the window is: widening the rail moves the strip.
  await dragDivider(page, "会话栏宽度", 80);
  expect(await widthOf(page, ".sidebar")).toBeGreaterThan(280);
  expect(await drift()).toBeLessThanOrEqual(1);

  // Collapsed, there is no terminal column to line up with: the section shrinks
  // back to its own two controls and the strip follows them.
  await page.locator('[data-testid="toggle-sidebar"]').click();
  const collapsed = await page.locator(".topbar__tabs").boundingBox();
  expect(collapsed?.x ?? 999).toBeLessThan(120 + CHROME_INSET);
});

test("顶栏在每个分栏处画出分界，且与下面的列是同一条线", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  const side = page.locator(".topbar__side");

  // The rail's seam: a real 1px border, and it sits on the rail's own border
  // column — the section's right edge *is* the rail's right edge, so a
  // border-right inside it lands on the pixel the rail's border-right owns.
  const railBorder = await side.evaluate((element) => getComputedStyle(element).borderRightWidth);
  expect(railBorder).toBe("1px");
  const rail = await page.locator(".sidebar").boundingBox();
  const seamX = await side.evaluate((element) => element.getBoundingClientRect().right);
  expect(Math.abs(seamX - ((rail?.x ?? 0) + (rail?.width ?? 0)))).toBeLessThanOrEqual(1);

  // The panel's seam lands on the panel's own left border.
  const panel = await page.locator(".files-panel").boundingBox();
  const seam = await page.locator('[data-testid="seam-files"]').boundingBox();
  expect(seam, "文件面板那条分界没有画出来").not.toBeNull();
  expect(Math.abs((seam?.x ?? 0) - (panel?.x ?? 0))).toBeLessThanOrEqual(1);

  // With the rail away there is no boundary there, so no line is drawn.
  await page.locator('[data-testid="toggle-sidebar"]').click();
  const collapsed = await side.evaluate((element) => getComputedStyle(element).borderRightWidth);
  expect(collapsed).toBe("0px");
});

test("没有打开的终端时，右边栏开关不出现", async ({ page }) => {
  await expect(page.locator('[data-testid="toggle-files"]')).toHaveCount(0);

  await openSession(page, "e2e-alpha");

  await expect(page.locator('[data-testid="toggle-files"]')).toBeVisible();
});

test("文件面板收到最窄时，图标工具栏仍完整地留在面板里", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  // The seam is the panel's left edge: dragging it right narrows the panel.
  await dragDivider(page, "文件面板宽度", 200);

  const panel = await page.locator(".files-panel").boundingBox();
  expect(panel?.width).toBeCloseTo(220, 0);

  const actions = await page.locator(".files-panel .pane__actions").boundingBox();
  expect(actions, "工具栏没有布局盒").not.toBeNull();
  expect(actions?.x ?? 0).toBeGreaterThanOrEqual(panel?.x ?? 0);
  expect((actions?.x ?? 0) + (actions?.width ?? 0)).toBeLessThanOrEqual(
    (panel?.x ?? 0) + (panel?.width ?? 0),
  );
  await expect(page.locator(".files-panel .pane__actions > *").last()).toBeVisible();

  const overflow = await page
    .locator(".files-panel .pane__head")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow, "头部横向溢出").toBeLessThanOrEqual(0);
});

test("页面缩放时，左上角图标在物理窗口像素中始终避开原生红绿灯", async ({ app, page }) => {
  for (const factor of [0.6, 1.4, 1]) {
    await app.evaluate(({ BrowserWindow }, nextFactor) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(nextFactor);
    }, factor);

    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(document.documentElement.style.getPropertyValue("--ui-zoom-factor")),
        ),
      )
      .toBeCloseTo(factor, 2);

    if (process.platform === "darwin") {
      const physicalLeft = await page
        .locator(".topbar__brand")
        .evaluate((el, z) => el.getBoundingClientRect().left * z, factor);
      expect(physicalLeft).toBeCloseTo(CHROME_INSET, 0);

      const buttonPos = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getWindowButtonPosition(),
      );
      expect(buttonPos).toEqual({ x: 14, y: Math.round(20 * factor - 6) });
    }
  }
});

/**
 * The window's own zoom chords. `sendInputEvent` is how a spec reaches
 * `before-input-event`; the menu accelerators the app keeps for Ctrl+- and
 * Ctrl+0 are invisible to it, which is exactly why the unshifted Ctrl+= has
 * to be handled here.
 */
test("Ctrl+= 与小键盘加号都能放大页面，带 Shift 的组合留给终端字号", async ({ app, page }) => {
  const primary = process.platform === "darwin" ? "meta" : "control";
  const zoomLevel = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getZoomLevel() ?? null);
  const renderedFactor = () =>
    page.evaluate(() =>
      Number.parseFloat(document.documentElement.style.getPropertyValue("--ui-zoom-factor")),
    );
  const press = (keyCode: string, modifiers: ("control" | "meta" | "shift")[]) =>
    app.evaluate(({ BrowserWindow }, chord) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      if (!contents) return;
      contents.sendInputEvent({ type: "keyDown", keyCode: chord.keyCode, modifiers: chord.modifiers });
      contents.sendInputEvent({ type: "keyUp", keyCode: chord.keyCode, modifiers: chord.modifiers });
    }, { keyCode, modifiers });

  expect(await zoomLevel()).toBe(0);

  // The default menu only binds CommandOrControl+Plus (Ctrl+Shift+=), the chord
  // the terminal uses for its font size; the unshifted one is ours to provide.
  await press("=", [primary]);
  await expect.poll(zoomLevel).toBe(0.5);
  await expect.poll(renderedFactor).toBeCloseTo(1.2 ** 0.5, 2);

  // The numpad chord was unbound for the same reason.
  await press("numadd", [primary]);
  await expect.poll(zoomLevel).toBe(1);

  // The shifted chord belongs to the terminal. This handler must not consume
  // it, or a focused terminal would lose its font-size shortcut.
  await press("=", [primary, "shift"]);
  await expect.poll(zoomLevel).toBe(1);
});
