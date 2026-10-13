/**
 * The settings page's runtime section, rendered as markup.
 *
 * The rule worth pinning is that the application's own version is on screen next
 * to the CLI's. A report that only carries the CLI version cannot be acted on,
 * and the two numbers look alike enough that "one is missing" is easy to ship.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { SettingsPage } from "./SettingsPage";

const noop = () => {};

beforeEach(() => {
  store.current = {
    settingsOpen: true,
    closeSettings: noop,
    env: {
      cli_path: "C:\\bundled\\python.exe",
      cli_source: "bundled",
      cli_version: "0.7.4",
      config_dir: "C:\\config",
      sessions_file_exists: true,
      authenticated: true,
      account: null,
      accelerator_eligibility: null,
      token_expiry: null,
      has_refresh_token: false,
      hint: null,
      app_version: "0.3.0",
    },
    usage: null,
    selectedSession: null,
    theme: "system",
    language: "zh",
    panelWidths: { sidebar: 260, files: 320 },
    setTheme: noop,
    setLanguage: noop,
    setPanelWidth: noop,
    refreshEnvironment: noop,
  };
});

const render = (): string =>
  renderToStaticMarkup(createElement(SettingsPage, { initialSection: "runtime" }));

describe("the runtime section", () => {
  it("shows the application version and the CLI version, distinguishably", () => {
    const text = render().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("0.3.0");
    expect(text).toContain("0.7.4");
  });

  it("does not claim a version it was not given", () => {
    store.current.env = { ...(store.current.env as Record<string, unknown>), app_version: "" };
    expect(render()).not.toContain("0.3.0");
  });
});
