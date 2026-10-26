/**
 * The settings page's account and about sections, rendered as markup.
 *
 * Two rules live here. The application's own version must be on screen next to
 * the CLI's — a report that only carries the CLI version cannot be acted on,
 * and the two numbers look alike enough that "one is missing" is easy to ship.
 * And the updater's state must say what it is doing, including when there is no
 * updater at all: a panel that showed a check button on a platform that cannot
 * update would be offering something that does nothing.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@shared/types";
import { i18n } from "../i18n/i18n";
import { DEFAULT_TERMINAL_APPEARANCE } from "../lib/terminal-appearance";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { SettingsPage } from "./SettingsPage";
import { SECTION_IDS, type SectionId } from "./settings-sections";

const noop = () => {};

function baseState(update: UpdateStatus) {
  return {
    settingsOpen: true,
    settingsSection: "appearance",
    setSettingsSection: noop,
    closeSettings: noop,
    env: {
      app_version: "0.3.0",
      cli_path: "C:\\bundled\\python.exe",
      cli_source: "bundled",
      cli_version: "0.7.5",
      config_dir: "C:\\config",
      sessions_file_exists: true,
      authenticated: true,
      account: null,
      accelerator_eligibility: null,
      token_expiry: null,
      has_refresh_token: false,
      ssh_identity: "C:\\Users\\dev\\.ssh\\id_ed25519",
      hint: null,
    },
    usage: null,
    selectedSession: null,
    theme: "system",
    language: "zh",
    terminal: DEFAULT_TERMINAL_APPEARANCE,
    setTerminalAppearance: noop,
    panelWidths: { sidebar: 260, files: 320 },
    setTheme: noop,
    setLanguage: noop,
    setPanelWidth: noop,
    zoomLevel: 0,
    setZoomLevel: noop,
    refreshEnvironment: noop,
    refreshSshIdentity: noop,
    update,
    dismissedVersion: null,
    checkForUpdates: noop,
    downloadUpdate: noop,
    installUpdate: noop,
    setUpdateStatus: noop,
    dismissUpdate: noop,
  };
}

beforeEach(() => {
  store.current = baseState({ state: "idle" });
});

const render = (section: SectionId): string => {
  (store.current as { settingsSection: SectionId }).settingsSection = section;
  return renderToStaticMarkup(createElement(SettingsPage));
};
const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("the appearance section", () => {
  it("shows the interface zoom with its current percentage and a reset", () => {
    const html = render("appearance");

    expect(text(html)).toContain("界面缩放");
    expect(text(html)).toContain("调整整个窗口的显示比例。");
    expect(text(html)).toContain("100%");
    expect(html).toContain('data-testid="ui-zoom-value"');
    expect(html).toContain("放大界面");
    expect(html).toContain("缩小界面");
    expect(html).toContain("重置");
  });

  it("disables only the step that would leave the range, and Reset at 100%", () => {
    const disabledCount = (): number => (render("appearance").match(/disabled/g) ?? []).length;

    store.current = { ...baseState({ state: "idle" }), zoomLevel: 0 };
    expect(disabledCount()).toBe(1); // Reset

    store.current = { ...baseState({ state: "idle" }), zoomLevel: -3 };
    expect(disabledCount()).toBe(1); // Zoom out

    store.current = { ...baseState({ state: "idle" }), zoomLevel: 5 };
    expect(disabledCount()).toBe(1); // Zoom in

    store.current = { ...baseState({ state: "idle" }), zoomLevel: 1 };
    expect(disabledCount()).toBe(0);
  });
});

describe("the account section", () => {
  it("shows the application version and the CLI version, distinguishably", () => {
    const rendered = text(render("about")) + text(render("account"));
    expect(rendered).toContain("0.3.0");
    expect(rendered).toContain("0.7.5");
  });

  it("keeps the local CLI environment beside the account it authorizes", () => {
    const rendered = text(render("account"));
    expect(rendered).toContain("本地 Colab 环境");
    expect(rendered).toContain("colab 命令");
    expect(rendered).toContain("C:\\bundled\\python.exe");
  });

  it("offers key generation only when no usable SSH key was found", () => {
    expect(text(render("account"))).toContain("C:\\Users\\dev\\.ssh\\id_ed25519");
    expect(text(render("account"))).not.toContain("生成密钥");

    const state = baseState({ state: "idle" });
    (state.env as { ssh_identity: string | null }).ssh_identity = null;
    store.current = state;
    expect(text(render("account"))).toContain("未检测到可用密钥");
    expect(text(render("account"))).toContain("生成密钥");
  });
});

describe("the about section", () => {
  it("offers a check when there is an updater and nothing to report", () => {
    const html = render("about");
    expect(text(html)).toContain("0.3.0");
    expect(html).toContain('data-testid="update-check"');
  });

  it("states the app's third-party status, and keeps it off the account page", () => {
    const phrase = "第三方开源客户端";
    expect(text(render("about"))).toContain(phrase);
    expect(text(render("account"))).not.toContain(phrase);
  });

  it("names the version when one is available, and offers to download it", () => {
    store.current = baseState({ state: "available", version: "0.4.0" });
    const rendered = text(render("about"));
    expect(rendered).toContain("0.4.0");
    expect(render("about")).toContain('data-testid="update-download"');
  });

  it("does not offer to check while a download is already running", () => {
    store.current = baseState({ state: "downloading", version: "0.4.0", percent: 40 });
    expect(render("about")).not.toContain('data-testid="update-check"');
  });

  it("offers a restart once the build has downloaded, not another download", () => {
    store.current = baseState({ state: "downloaded", version: "0.4.0" });
    const html = render("about");
    expect(html).toContain('data-testid="update-install"');
    expect(html).not.toContain('data-testid="update-download"');
  });

  it("says a build cannot update rather than offering a button that does nothing", () => {
    store.current = baseState({ state: "unavailable" });
    const html = render("about");
    expect(text(html)).toContain("暂不支持自动更新");
    expect(html).not.toContain('data-testid="update-download"');
  });

  it("turns a failure the user asked for into a sentence, and keeps it retryable", () => {
    store.current = baseState({
      state: "error",
      reason: "network",
      detail: "net::ERR_INTERNET_DISCONNECTED",
      userInitiated: true,
      version: "0.4.0",
    });
    const rendered = text(render("about"));
    expect(rendered).toContain("无法连接更新服务器");
    // The raw transport string is there for a bug report, below the sentence.
    expect(rendered).toContain("ERR_INTERNET_DISCONNECTED");
    expect(render("about")).toContain('data-testid="update-retry"');
  });

  it("keeps a background failure quiet, because nobody was waiting for it", () => {
    store.current = baseState({
      state: "error",
      reason: "network",
      detail: "net::ERR_INTERNET_DISCONNECTED",
      userInitiated: false,
      version: null,
    });
    const rendered = text(render("about"));
    expect(rendered).not.toContain("无法连接更新服务器");
    expect(rendered).toContain("将自动重试");
  });

  it("does not offer a retry when the failure left no version to ask for", () => {
    store.current = baseState({
      state: "error",
      reason: "unknown",
      detail: "boom",
      userInitiated: true,
      version: null,
    });
    expect(render("about")).not.toContain('data-testid="update-retry"');
  });
});

describe("the appearance section", () => {
  it("presents language and theme as one segmented control each", () => {
    const html = render("appearance");

    expect((html.match(/class="segmented"/g) ?? []).length).toBe(2);
    expect((html.match(/segmented__item--active/g) ?? []).length).toBe(2);
    expect(html).toMatch(/aria-pressed="true"[^>]*>中文</);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="theme-choice-system"[^>]*>系统</);
    expect(html).toContain('data-testid="theme-choice-light"');
    expect(html).toContain('data-testid="theme-choice-dark"');
  });
});

describe("in English", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh");
  });

  /**
   * A language name is written in its own script in both catalogs — an English
   * reader looking for Chinese has to recognize 「中文」, and the picker
   * would be useless if it said "Chinese" in the one place they
   * would go looking. Everything else in this panel is copy and follows the
   * reader.
   */
  const LANGUAGE_NAMES = ["中文"];

  it("每个分节都不出现中文——漏 key 会拿到中文兜底，漏 t() 会漏出源码里的中文", async () => {
    // Every string in this panel is passed with a Chinese default, so a key
    // missing from en.json degrades to Chinese silently. This is the check that
    // notices — the parity test only compares the two catalogues to each other.
    // It renders *every* section, not just the one whose copy happened to be
    // under review: the language picker shipped "跟随系统" to English readers
    // while this assertion was looking at "about".
    await i18n.changeLanguage("en");
    for (const section of SECTION_IDS) {
      const rendered = LANGUAGE_NAMES.reduce(
        (remaining, name) => remaining.split(name).join(""),
        text(render(section)),
      );
      expect(rendered, `section: ${section}`).not.toMatch(/[一-鿿]/);
    }
  });
});
