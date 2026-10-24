/**
 * Pane groups, driven through the same path a person uses: drag a tab in its
 * own strip, drag it onto another pane's strip or body edge, and watch the
 * shells — not just the DOM — survive.
 *
 * A split must never remount a TerminalPane: every assertion that moves a tab
 * comes back to a shell that was already running, by its banner and by output
 * that only that shell has.
 */

import type { Locator, Page } from "@playwright/test";
import { expect, focusTerminal, openSession, terminalRows, test } from "./app-launch";

/** The visible pane showing a particular shell. */
function paneWithShell(page: Page, ordinal: number): Locator {
  return page.locator(".pane-slot:visible").filter({ hasText: `shell #${ordinal}` });
}

function groupStrip(page: Page, index: number): Locator {
  return page.locator(".group-strip").nth(index);
}

async function centerOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error("target has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function rightEdgeOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error("target has no box");
  return { x: box.x + box.width - 12, y: box.y + box.height / 2 };
}

async function bottomEdgeOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error("target has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height - 12 };
}

/** Pointer drag with dnd-kit's 12px activation threshold. */
async function dragTabTo(
  page: Page,
  tab: Locator,
  point: { x: number; y: number },
  overlayZone?: "left" | "right" | "top" | "bottom" | "center",
): Promise<void> {
  const box = await tab.boundingBox();
  if (!box) throw new Error("tab has no box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Cross dnd-kit's activation distance before aiming, otherwise the press is
  // just a click.
  await page.mouse.move(startX + 16, startY, { steps: 4 });
  await page.mouse.move(point.x, point.y, { steps: 12 });
  if (overlayZone) {
    await expect(page.locator(`.tab-drop-overlay[data-zone="${overlayZone}"]`)).toBeVisible();
  }
  await page.mouse.up();
}

/** Focuses a particular pane's xterm input, verified rather than assumed. */
async function focusPane(page: Page, pane: Locator): Promise<void> {
  const input = pane.locator(".xterm-helper-textarea");
  await expect(async () => {
    await input.focus();
    expect(await page.evaluate(() => document.activeElement?.className ?? "")).toContain(
      "xterm-helper-textarea",
    );
  }).toPass({ timeout: 5_000 });
}

test("拖拽标签在同一个面板内重排，终端不重连", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(page.locator(".group-strip [role=tab]")).toHaveCount(3);
  await expect(terminalRows(page)).toContainText("shell #3");

  const tabs = page.locator(".group-strip [role=tab]");
  const first = await tabs.nth(0).boundingBox();
  const strip = await page.locator(".group-strip").boundingBox();
  if (!first || !strip) throw new Error("没有布局盒");

  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 16, first.y + first.height / 2, { steps: 4 });
  await page.mouse.move(strip.x + strip.width - 10, strip.y + strip.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(tabs).toHaveText(["终端 2", "终端 3", "终端 1"]);
  // Reordering is not activation: the third shell is still the one on screen.
  await expect(terminalRows(page)).toContainText("shell #3");

  await focusTerminal(page);
  await page.keyboard.type("echo STILL-HERE");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("STILL-HERE");
});

test("新建按钮跟在最后一个标签后面，而不是停在这一行的最右边", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await page.locator('[data-testid="new-terminal"]').click();

  const strip = page.locator(".group-strip");
  const tabs = strip.locator("[role=tab]");
  await expect(tabs).toHaveCount(3);

  const last = await tabs.last().boundingBox();
  const add = await strip.locator('[data-testid="new-terminal"]').boundingBox();
  const stripBox = await strip.boundingBox();
  if (!last || !add || !stripBox) throw new Error("没有布局盒");

  // The button starts where the run ends — the tab's border-right is the seam.
  expect(Math.abs(add.x - (last.x + last.width))).toBeLessThanOrEqual(1);
  // The rest of the row is free space, not a second anchor: that gap is what
  // tells "after the tabs" apart from "at the far right".
  expect(stripBox.x + stripBox.width - (add.x + add.width)).toBeGreaterThan(100);
});

test("把标签拖到面板右边，分成左右两个 pane，各自的 shell 都活着", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(terminalRows(page)).toContainText("shell #2");

  const firstTab = page.getByRole("tab", { name: "终端 1" });
  const activePane = page.locator(".pane-slot:visible").first();
  await dragTabTo(page, firstTab, await rightEdgeOf(activePane), "right");

  await expect(page.locator(".group-strip")).toHaveCount(2);
  await expect(page.locator(".pane-slot:visible")).toHaveCount(2);

  const left = paneWithShell(page, 2);
  const right = paneWithShell(page, 1);
  await expect(left).toContainText("shell #2");
  await expect(right).toContainText("shell #1");

  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  if (!leftBox || !rightBox) throw new Error("没有布局盒");
  expect(rightBox.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width - 2);
  expect(Math.abs(rightBox.y - leftBox.y)).toBeLessThan(2);

  // The two panes are two independent shells, not two views of one.
  await focusPane(page, right);
  await page.keyboard.type("echo RIGHT-ONLY");
  await page.keyboard.press("Enter");
  await expect(right.locator(".xterm-rows")).toContainText("RIGHT-ONLY");
  await expect(left.locator(".xterm-rows")).not.toContainText("RIGHT-ONLY");
});

test("拖动当前激活的标签分屏后，键盘还留在那个终端里", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(terminalRows(page)).toContainText("shell #2");
  await focusTerminal(page);
  await page.keyboard.type("echo BEFORE-DRAG");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("BEFORE-DRAG");

  // The active tab is the one being split, so its pane was already focused and
  // stays focused: no prop change will ask xterm for the keyboard back. Pressing
  // the strip must therefore not take focus from it.
  const activeTab = page.getByRole("tab", { name: "终端 2" });
  const activePane = page.locator(".pane-slot:visible").first();
  await dragTabTo(page, activeTab, await rightEdgeOf(activePane), "right");

  const right = paneWithShell(page, 2);
  await expect(right).toContainText("shell #2");
  await page.keyboard.type("echo ACTIVE-SPLIT");
  await page.keyboard.press("Enter");
  await expect(right.locator(".xterm-rows")).toContainText("ACTIVE-SPLIT");

  // A plain click on the active tab is the same promise, without a drag.
  await page.getByRole("tab", { name: "终端 2" }).click();
  await page.keyboard.type("echo CLICK-STILL");
  await page.keyboard.press("Enter");
  await expect(right.locator(".xterm-rows")).toContainText("CLICK-STILL");
});

test("把标签拖到面板下边，分成上下两个 pane", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(terminalRows(page)).toContainText("shell #2");

  const firstTab = page.getByRole("tab", { name: "终端 1" });
  const activePane = page.locator(".pane-slot:visible").first();
  await dragTabTo(page, firstTab, await bottomEdgeOf(activePane), "bottom");

  const strips = page.locator(".group-strip");
  await expect(strips).toHaveCount(2);
  const topStrip = await strips.nth(0).boundingBox();
  const bottomStrip = await strips.nth(1).boundingBox();
  if (!topStrip || !bottomStrip) throw new Error("没有布局盒");
  expect(bottomStrip.y).toBeGreaterThan(topStrip.y + 100);

  const top = paneWithShell(page, 2);
  const bottom = paneWithShell(page, 1);
  await expect(top).toContainText("shell #2");
  await expect(bottom).toContainText("shell #1");
});

test("把标签拖到另一个 pane 的中心：合并进那个 group，原来的 shell 还活着", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(terminalRows(page)).toContainText("shell #2");

  // Leave a marker in the first shell before it is moved.
  await page.getByRole("tab", { name: "终端 1" }).click();
  await expect(terminalRows(page)).toContainText("shell #1");
  await focusTerminal(page);
  await page.keyboard.type("echo KEEP-ME");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("KEEP-ME");

  await page.getByRole("tab", { name: "终端 2" }).click();
  await focusTerminal(page);
  await page.keyboard.type("echo SECOND-MARK");
  await page.keyboard.press("Enter");
  await expect(terminalRows(page)).toContainText("SECOND-MARK");

  const firstTab = page.getByRole("tab", { name: "终端 1" });
  const activePane = page.locator(".pane-slot:visible").first();
  await dragTabTo(page, firstTab, await rightEdgeOf(activePane), "right");

  const right = paneWithShell(page, 1);
  await expect(right.locator(".xterm-rows")).toContainText("KEEP-ME");

  // Move terminal 2 into terminal 1's pane: the source pane empties and goes
  // away, and the target group now has both tabs.
  const secondTab = page.getByRole("tab", { name: "终端 2" });
  await dragTabTo(page, secondTab, await centerOf(right), "center");

  await expect(page.locator(".group-strip")).toHaveCount(1);
  await expect(page.locator(".pane-slot:visible")).toHaveCount(1);
  await expect(terminalRows(page)).toContainText("shell #2");
  // This is the shell that was just moved between groups.
  await expect(terminalRows(page)).toContainText("SECOND-MARK");

  // And the shell moved by the earlier split still has its own scrollback.
  await page.getByRole("tab", { name: "终端 1" }).click();
  await expect(terminalRows(page)).toContainText("shell #1");
  await expect(terminalRows(page)).toContainText("KEEP-ME");
});

test("把一个 pane 的标签拖到另一个 pane 的标签条，跨组移动", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  await page.locator('[data-testid="new-terminal"]').click();
  await expect(terminalRows(page)).toContainText("shell #3");

  const firstTab = page.getByRole("tab", { name: "终端 1" });
  const activePane = page.locator(".pane-slot:visible").first();
  await dragTabTo(page, firstTab, await rightEdgeOf(activePane), "right");
  await expect(page.locator(".group-strip")).toHaveCount(2);

  const sourceStrip = groupStrip(page, 0);
  const targetStrip = groupStrip(page, 1);
  await expect(sourceStrip.getByRole("tab")).toHaveText(["终端 2", "终端 3"]);
  await expect(targetStrip.getByRole("tab")).toHaveText(["终端 1"]);

  const secondTab = page.getByRole("tab", { name: "终端 2" });
  const firstTargetTab = targetStrip.getByRole("tab").first();
  const firstTargetBox = await firstTargetTab.boundingBox();
  if (!firstTargetBox) throw new Error("没有布局盒");
  await dragTabTo(page, secondTab, {
    x: firstTargetBox.x + 6,
    y: firstTargetBox.y + firstTargetBox.height / 2,
  });

  await expect(sourceStrip.getByRole("tab")).toHaveText(["终端 3"]);
  // It lands before the tab it was dropped on, not at the end.
  await expect(targetStrip.getByRole("tab")).toHaveText(["终端 2", "终端 1"]);
  await expect(page.locator(".group-strip")).toHaveCount(2);
  // The moved tab becomes the target pane's active one; the source keeps its
  // own active tab on screen.
  await expect(paneWithShell(page, 3)).toContainText("shell #3");
  await expect(paneWithShell(page, 2)).toContainText("shell #2");
});

test("拖动 pane 之间的分隔条，两个 shell 都不受影响", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  // The divider floor is per pane; with both rails open on the CI-sized window
  // a split has almost no room left to demonstrate a drag. Collapse them first.
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await page.locator('[data-testid="toggle-files"]').click();

  const firstTab = page.getByRole("tab", { name: "终端 1" });
  const activePane = page.locator(".pane-slot:visible").first();
  await dragTabTo(page, firstTab, await rightEdgeOf(activePane), "right");

  const leftStrip = groupStrip(page, 0);
  const divider = page.locator(".pane-divider");
  await expect(divider).toHaveAttribute("role", "separator");
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  await expect(divider).toHaveAttribute("aria-label", "调整分屏大小 1");

  // Keyboard resize is the accessible path to the same ratio.
  const beforeKeyboard = await leftStrip.boundingBox();
  const startValue = Number(await divider.getAttribute("aria-valuenow"));
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  const afterKeyboard = await leftStrip.boundingBox();
  expect(afterKeyboard!.width).toBeGreaterThan(beforeKeyboard!.width);
  await expect
    .poll(async () => Number(await divider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(startValue);

  const before = await leftStrip.boundingBox();
  const dividerBox = await divider.boundingBox();
  if (!before || !dividerBox) throw new Error("没有布局盒");

  const x = dividerBox.x + dividerBox.width / 2;
  const y = dividerBox.y + dividerBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 12 });
  await page.mouse.up();

  const after = await leftStrip.boundingBox();
  // The pane floor (240px) caps how far a split can grow with both rails open;
  // the point is that the seam moved and committed, not by how much.
  expect(after!.width).toBeGreaterThan(before.width + 20);

  await expect(paneWithShell(page, 2)).toContainText("shell #2");
  await expect(paneWithShell(page, 1)).toContainText("shell #1");
});

test("拖拽途中按 Escape 不改变布局", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await page.locator('[data-testid="new-terminal"]').click();
  const firstTab = page.getByRole("tab", { name: "终端 1" });
  const activePane = page.locator(".pane-slot:visible").first();

  const box = await firstTab.boundingBox();
  const target = await rightEdgeOf(activePane);
  if (!box) throw new Error("tab has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await expect(page.locator('.tab-drop-overlay[data-zone="right"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(page.locator(".group-strip")).toHaveCount(1);
  await expect(page.locator(".pane-slot:visible")).toHaveCount(1);
  await expect(terminalRows(page)).toContainText("shell #2");
});
