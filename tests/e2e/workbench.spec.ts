/**
 * The window shell: what the app looks like before anything is connected, and
 * the three window-level behaviours that have no page to click through — the
 * frameless title bar's drag regions, our own window controls, and the panels.
 */

import type { Page } from "@playwright/test";
import { expect, openSession, reloadWorkbench, test } from "./app-launch";

/** The drag region Chromium resolved for an element. */
function dragRegion(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-app-region").trim());
}

/**
 * A settings row, found by its label. The label gets its own element because
 * matching the whole row on text breaks as soon as one row's description
 * repeats a word from another row's label — which is exactly what happened when
 * the accelerator copy became "当前账号有权限申请的硬件加速规格。".
 */
function settingsRow(page: Page, label: string) {
  return page.locator(".panel-row", {
    has: page.locator(".panel-row__title", { hasText: label }),
  });
}

test("没有会话时，工作台已给出全部机器状态", async ({ page }) => {
  await expect(page.locator('[data-testid="session-row"]')).toHaveCount(2);

  // 中间是起始页：有名字、有主张，也有下一步该做什么。
  const home = page.locator(".startpage");
  await expect(home).toContainText("把远程 GPU 运行时当本地机器用");
  await expect(home).toContainText("选一个会话，或新建一个运行时。");
  await expect(home.getByRole("button", { name: "新建会话" })).toBeVisible();
  await expect(page.locator('[data-testid="star-on-github"]')).toBeVisible();

  // 余额、速率与活跃会话都来自桩回答，走的是真实的解析路径；右侧是全局终端计数。
  const status = page.locator(".statusbar");
  await expect(status).toContainText("42.50 CU");
  await expect(status).toContainText("1.25/h");
  await expect(status.locator('[data-testid="statusbar-assignments"]')).toHaveText("1");
  await expect(status.locator('[data-testid="terminal-count"]')).toHaveText("0");
});

test("服务器上有、本地没有的运行时也会列出来，但不可操作", async ({ page }) => {
  // 桩在 assignments 里多报了一个 endpoint，本地 sessions.json 里没有它——
  // 这正是真实环境里 `colab sessions` 打 `[?]` 的那些运行时。
  const untrackedRow = page.locator('[data-testid="untracked-row"]');
  await expect(untrackedRow).toHaveCount(1);
  await expect(untrackedRow).toContainText("m-s-kkb-e2e0c1-untracked");
  await expect(untrackedRow).toContainText("未在本地记录");
  await expect(untrackedRow).toContainText("CPU");
  // 这一行不是控件：没有行内动作。
  await expect(untrackedRow.locator(".menu__trigger")).toHaveCount(0);
  // 有本地记录的运行时仍然是会话行，不会同时出现在未记录的那一边。
  await expect(page.locator('[data-testid="session-row"]')).toHaveCount(2);

  // 点一次同步（走真实的 `colab sessions` 加重新读取这条路径）：两半都还在。
  await page.locator('[data-testid="sync-sessions"]').click();
  await expect(page.locator('[data-testid="sidebar-overlay"]')).toHaveCount(0);
  await expect(untrackedRow).toHaveCount(1);
  await expect(page.locator('[data-testid="session-row"]')).toHaveCount(2);
});

test("顶栏是拖拽区，栏内控件退出拖拽", async ({ page }) => {
  expect(await dragRegion(page, ".topbar")).toBe("drag");
  // 标签条横跨栏的中间且必须保持拖拽，否则两端的控件之间没有可抓的地方。
  expect(await dragRegion(page, ".topbar__tabs")).toBe("drag");
  expect(await dragRegion(page, '[data-testid="toggle-sidebar"]')).toBe("no-drag");
});

test("无边框窗口的控制通道接通", async ({ page }) => {
  test.skip(process.platform === "darwin", "macOS 保留系统红绿灯，没有自绘窗口控制");

  await expect(page.locator(".window-controls button")).toHaveCount(3);
  expect(await dragRegion(page, ".window-controls")).toBe("no-drag");

  // 走一遍真实的 IPC：容器里没有窗口管理器，最大化状态是平台相关的，
  // 但通道本身必须通——通道改名或处理器丢失都会在这里失败。
  const roundTrip = await page.evaluate(async () => {
    const bridge = (window as unknown as { colabdesk: { toggleMaximizeWindow(): Promise<void> } }).colabdesk;
    await bridge.toggleMaximizeWindow();
    await bridge.toggleMaximizeWindow();
    return "ok";
  });
  expect(roundTrip).toBe("ok");
});

test("两侧面板可收起再展开", async ({ page }) => {
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await expect(sidebar).toHaveCount(0);
  await page.locator('[data-testid="toggle-sidebar"]').click();
  await expect(sidebar).toBeVisible();
});

test("Ctrl+Shift+E 与会话栏开关是同一件事", async ({ page }) => {
  await page.keyboard.press("Control+Shift+E");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+E");
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("主题切换写下显式偏好，并在重启后仍然生效", async ({ app, page }) => {
  const resolved = (): Promise<string> => page.evaluate(() => document.documentElement.dataset.theme ?? "");
  const before = await resolved();
  const nextTheme = before === "dark" ? "light" : "dark";

  // 打开设置
  await page.locator('[data-testid="open-settings"]').click();
  await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

  // 切换到外观设置
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator(`[data-testid="theme-choice-${nextTheme}"]`).click();

  const after = await resolved();
  expect(after).not.toBe(before);
  // 显式选择比 OS 优先，所以要落盘；否则重开又跟随系统了。
  expect(await page.evaluate(() => localStorage.getItem("colabdesk.theme"))).toBe(nextTheme);

  await reloadWorkbench(app, page);
  expect(await resolved()).toBe(nextTheme);
});

/**
 * The terminal's palette follows the app's polarity out of the box, which is the
 * whole point of the light palettes: a light window with a black terminal is
 * what this answers. Both halves are on screen — the attribute, and the painted
 * background of the surface the user is looking at.
 */
test("界面切浅色，终端跟着换浅色调色板，shell 不受影响", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.locator(".xterm-rows")).toContainText("shell #1");

  const palette = (): Promise<string> =>
    page.evaluate(() => document.documentElement.dataset.terminalTheme ?? "");
  const painted = (): Promise<string> =>
    page.locator(".terminal-area").evaluate((el) => getComputedStyle(el).backgroundColor);

  // An explicit choice first: the default is "follow the system", and what the
  // runner's desktop prefers is not this test's business.
  await page.locator('[data-testid="open-settings"]').click();
  await page.getByRole("button", { name: "外观" }).click();
  await page.locator('[data-testid="theme-choice-dark"]').click();
  await expect.poll(palette).toBe("titanium");

  await page.locator('[data-testid="theme-choice-light"]').click();
  await expect.poll(palette).toBe("catppuccin-latte");
  // #eff1f5 — Catppuccin Latte's base, the same value the frame and xterm take.
  await expect.poll(painted).toBe("rgb(239, 241, 245)");

  // The swap is a repaint, not a reconnect: same shell, same directory.
  await page.locator('[data-testid="close-settings"]').click();
  await expect(page.locator('[data-testid="terminal-status"]')).toContainText("已连接");
  await expect(page.locator(".xterm-rows")).toContainText("cd /content");
  await expect(page.locator('[data-testid="terminal-count"]')).toHaveText("1");
});

test("语言切换写下偏好并在重载后生效，且动态更新界面文案", async ({ app, page }) => {
  // 打开设置
  await page.locator('[data-testid="open-settings"]').click();
  await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

  // 切换到外观设置
  await page.getByRole("button", { name: "外观" }).click();

  // 切换为 English
  await page.getByRole("button", { name: "English" }).click();

  // 界面文案已变为英文
  await expect(page.locator(".settings__title")).toContainText("Appearance");
  await expect(page.locator('[data-testid="close-settings"]')).toContainText("Back to Workbench");

  // 偏好落盘
  expect(await page.evaluate(() => localStorage.getItem("colabdesk.language"))).toBe("en");

  // 返回工作台
  await page.locator('[data-testid="close-settings"]').click();
  await expect(page.locator(".startpage")).toContainText("Run a remote GPU runtime like a local machine");
  await expect(page.locator(".startpage")).toContainText("New session");

  // 跨重载保留
  await reloadWorkbench(app, page);
  await expect(page.locator(".startpage")).toContainText("Run a remote GPU runtime like a local machine");

  // 重新打开设置切回中文（简体）
  await page.locator('[data-testid="open-settings"]').click();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("button", { name: "中文（简体）" }).click();
  await expect(page.locator(".settings__title")).toContainText("外观");
  expect(await page.evaluate(() => localStorage.getItem("colabdesk.language"))).toBe("zh");
});

test("设置页面导航栏宽度与会话栏一致，支持拖拽拉伸且双向同步", async ({ page }) => {
  const sidebarBox = await page.locator(".sidebar").boundingBox();
  expect(sidebarBox).not.toBeNull();

  // 打开设置
  await page.locator('[data-testid="open-settings"]').click();
  await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

  // 设置导航栏宽度与会话栏一致
  const navBox = await page.locator(".settings__nav").boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox!.width).toBeCloseTo(sidebarBox!.width, 1);

  // 分隔条存在并可拖拽拉伸
  const divider = page.locator('[data-testid="divider-settings"]');
  await expect(divider).toBeVisible();
  const dBox = await divider.boundingBox();
  expect(dBox).not.toBeNull();

  const x = dBox!.x + dBox!.width / 2;
  const y = dBox!.y + dBox!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y, { steps: 10 });
  await page.mouse.up();

  // 导航栏宽度已改变
  const stretchedNavBox = await page.locator(".settings__nav").boundingBox();
  expect(stretchedNavBox!.width).toBeGreaterThan(navBox!.width + 50);

  // 返回工作台，会话栏宽度与新拉伸的宽度一致
  await page.locator('[data-testid="close-settings"]').click();
  const newSidebarBox = await page.locator(".sidebar").boundingBox();
  expect(newSidebarBox!.width).toBeCloseTo(stretchedNavBox!.width, 1);

  // 在工作台拖拽会话栏，再进设置页面依然一致
  const sidebarDivider = page.locator('[data-testid="divider-sidebar"]');
  const sBox = await sidebarDivider.boundingBox();
  expect(sBox).not.toBeNull();
  const sx = sBox!.x + sBox!.width / 2;
  const sy = sBox!.y + sBox!.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 40, sy, { steps: 10 });
  await page.mouse.up();

  const shrunkSidebarBox = await page.locator(".sidebar").boundingBox();
  await page.locator('[data-testid="open-settings"]').click();
  const reopenedNavBox = await page.locator(".settings__nav").boundingBox();
  expect(reopenedNavBox!.width).toBeCloseTo(shrunkSidebarBox!.width, 1);
});

// 账号邮箱不在 token.json 里（CLI 写的永远是空串），只能拿访问令牌换回来；
// 加速器资格同理，来自 CLI 只取三个数字就丢掉的 ccu-info 响应。
test("设置页显示账号与可用加速器，不可用的加速器被划掉", async ({ page }) => {
  await page.locator('[data-testid="open-settings"]').click();

  const account = settingsRow(page, "当前账号");
  await expect(account).toContainText("e2e@example.com");

  const accelerators = settingsRow(page, "可用加速器");
  await expect(accelerators).toContainText("A100");
  await expect(accelerators.locator(".badge--off")).toHaveText("H100");
  await expect(accelerators.locator(".badge", { hasText: "T4" })).not.toHaveClass(/badge--off/);
});

test("新建会话不提供本账号拿不到的加速器", async ({ page }) => {
  await page.locator('[aria-label="新建会话"]').click();
  const dialog = page.getByRole("dialog", { name: "新建会话" });
  await expect(dialog).toBeVisible();

  // 提示先说清楚能用什么，选项本身再逐个标注。
  await expect(dialog).toContainText("当前账号可用：G4 / A100 / L4 / T4 / V6E1 / V5E1");

  const h100 = dialog.locator('option[value="H100"]');
  expect(await h100.evaluate((option: HTMLOptionElement) => option.disabled)).toBe(true);
  await expect(h100).toContainText("当前账号不可用");

  const t4 = dialog.locator('option[value="T4"]');
  expect(await t4.evaluate((option: HTMLOptionElement) => option.disabled)).toBe(false);
  await expect(t4).not.toContainText("不可用");
});

// 对话框只该在打开那一刻重置自己：名字打进去要留下、选好的加速器不弹回默认、勾上的高内存
// 不自己弹开、创建失败的红字不闪一帧就没。四个症状同一个不变量，所以钉在同一个用例里；而
// 它只能钉在这里——渲染断言（renderToStaticMarkup）不跑 effect 与提交，看不见这一层。
test("新建会话：填进去的东西不会被自己擦掉", async ({ page }) => {
  await page.locator('[aria-label="新建会话"]').click();
  const dialog = page.getByRole("dialog", { name: "新建会话" });
  await expect(dialog).toBeVisible();

  // 名字：打进去就留在框里。
  const name = dialog.getByLabel("会话名称");
  await name.fill("e2e-alpha");
  await expect(name).toHaveValue("e2e-alpha");

  // 加速器：本账号的默认是 T4，选了 A100 之后不该弹回去。
  const accelerator = dialog.locator("select");
  await accelerator.selectOption("A100");
  await expect(accelerator).toHaveValue("A100");

  // 高内存：勾上就保持勾着。
  const highMem = dialog.getByRole("checkbox");
  await highMem.check();
  await expect(highMem).toBeChecked();

  // 创建失败的红字要留在界面上。名字用已存在的那个，桩据此回「已存在」。
  await dialog.getByRole("button", { name: "创建" }).click();
  const failure = dialog.locator(".callout--danger");
  await expect(failure).toContainText("命令执行失败");
  // 只闪一帧的话，上面那次断言会在那一帧上通过；隔一会儿再看一次才是这条的要点。
  await page.waitForTimeout(300);
  await expect(failure).toContainText("命令执行失败");
});

// 右上角是一个 ×，不是一行"关闭"文字：字形给不出这个名字，所以文案挂在 aria-label 上，
// 按钮里就只剩一个 svg。
test("新建会话右上角是一个有名字的 ×，点它会关掉对话框", async ({ page }) => {
  await page.locator('[aria-label="新建会话"]').click();
  const dialog = page.getByRole("dialog", { name: "新建会话" });
  await expect(dialog).toBeVisible();

  const close = dialog.getByRole("button", { name: "关闭" });
  expect(await close.textContent()).toBe("");
  await expect(close.locator("svg")).toHaveCount(1);

  // 图标按钮最容易出的事故是缩到点不着；低于 28px 高的可点区域在设计系统里算缺陷。
  const box = await close.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(28);
  expect(box!.height).toBeGreaterThanOrEqual(28);

  await close.click();
  await expect(dialog).toHaveCount(0);
});

test("同步会话按钮触发刷新遮罩并防重复点击，完成后遮罩消失", async ({ page }) => {
  const syncBtn = page.locator('[data-testid="sync-sessions"]');
  await expect(syncBtn).toBeVisible();
  await expect(syncBtn).toHaveAttribute("aria-label", "同步");
  await expect(syncBtn).toBeEnabled();

  // 点击同步
  await syncBtn.click();

  // 同步完成后按钮恢复可用，遮罩消失
  await expect(syncBtn).toBeEnabled();
  await expect(syncBtn).toHaveAttribute("aria-label", "同步");
  await expect(page.locator('[data-testid="sidebar-overlay"]')).toHaveCount(0);
});

// 关掉最后一个终端之后停在「这个会话还没有终端」是对的（会话还在，下一步就是再开一个），
// 但如果会话本身没了还停在这一页，说的就是一个不存在的会话：名字已经不在会话栏里，
// 那句「新建终端」点下去只会去连一个连不上的运行时。
test("会话没了之后，工作台回到前门，不会停在「还没有终端」", async ({ page }) => {
  await openSession(page, "e2e-alpha");
  await expect(page.locator(".terminal-host")).toHaveCount(1);
  await page.getByLabel("关闭终端 1").click();
  await expect(page.locator(".startpage")).toContainText("「e2e-alpha」还没有终端。");

  // 停止会话：桩把它从 sessions.json 里删掉，和真机上「删除运行时后同步」是同一条路。
  page.on("dialog", (dialog) => void dialog.accept());
  await page.locator(".session-row", { hasText: "e2e-alpha" }).locator(".menu__trigger").click();
  await page.getByRole("menuitem", { name: "停止会话" }).click();

  await expect(page.locator('[data-testid="session-row"]')).toHaveCount(1);
  await expect(page.locator(".startpage")).toContainText("选一个会话，或新建一个运行时。");
  await expect(page.locator(".startpage")).not.toContainText("还没有终端");
});

