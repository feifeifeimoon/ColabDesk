/**
 * The update prompt, rendered as markup.
 *
 * The rules worth pinning are about what the user is *not* shown: a build they
 * waved away must not come back, and a download in progress has nothing to
 * decide so it must not push a decision at them. Both are the kind of thing
 * that only looks wrong to someone already annoyed by it.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@shared/types";
import "../i18n/i18n";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { Banners } from "./Banners";

const noop = () => {};

function state(update: UpdateStatus, dismissedVersion: string | null = null) {
  return {
    error: null,
    notice: null,
    setNotice: noop,
    update,
    dismissedVersion,
    downloadUpdate: noop,
    installUpdate: noop,
    dismissUpdate: noop,
  };
}

beforeEach(() => {
  store.current = state({ state: "idle" });
});

const render = (): string => renderToStaticMarkup(createElement(Banners));
const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("the update prompt", () => {
  it("says nothing when there is nothing to say", () => {
    expect(render()).toBe("");
    store.current = state({ state: "not-available", userInitiated: false });
    expect(render()).toBe("");
  });

  it("names the version and offers to download it", () => {
    store.current = state({ state: "available", version: "0.4.0" });
    const html = render();
    expect(text(html)).toContain("0.4.0");
    expect(html).toContain('data-testid="update-banner-download"');
  });

  it("does not come back for a build that was waved away", () => {
    store.current = state({ state: "available", version: "0.4.0" }, "0.4.0");
    expect(render()).toBe("");
  });

  it("comes back for the next build after one was waved away", () => {
    store.current = state({ state: "available", version: "0.5.0" }, "0.4.0");
    expect(text(render())).toContain("0.5.0");
  });

  it("offers a restart instead of a download once the build is on disk", () => {
    store.current = state({ state: "downloaded", version: "0.4.0" });
    const html = render();
    expect(html).toContain('data-testid="update-banner-install"');
    expect(html).not.toContain('data-testid="update-banner-download"');
  });

  it("stays out of the way while a download is running", () => {
    // There is no decision to make at 40%, and a banner that says so is noise.
    store.current = state({ state: "downloading", version: "0.4.0", percent: 40 });
    expect(render()).toBe("");
  });

  it("does not turn a background failure into an interruption", () => {
    store.current = state({
      state: "error",
      reason: "network",
      detail: "net::ERR_INTERNET_DISCONNECTED",
      userInitiated: false,
      version: null,
    });
    expect(render()).toBe("");
  });
});
