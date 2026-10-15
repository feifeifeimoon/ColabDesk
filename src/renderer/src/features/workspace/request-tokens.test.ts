/**
 * One rule, and the reason it exists: a slow answer must not overwrite a newer
 * one. The pane reads a folder from several places — opening it, refreshing it,
 * an upload landing in it — and every read opens its own channel, so the order
 * they finish in is not the order they started in.
 */

import { describe, expect, it } from "vitest";
import { makeRequestTokens } from "./request-tokens";

describe("request tokens", () => {
  it("lets the only request through", () => {
    const tokens = makeRequestTokens();
    expect(tokens.begin("/content")()).toBe(true);
  });

  it("supersedes an older request for the same key", () => {
    const tokens = makeRequestTokens();
    const first = tokens.begin("/content");
    const second = tokens.begin("/content");

    // The order they *finish* in is what this is for: the first one answering
    // last must not win.
    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });

  it("keeps directories apart", () => {
    const tokens = makeRequestTokens();
    const root = tokens.begin("/content");
    tokens.begin("/content/data");

    expect(root()).toBe(true);
  });

  it("only ever accepts the newest of a burst", () => {
    const tokens = makeRequestTokens();
    const started = [tokens.begin("/content"), tokens.begin("/content"), tokens.begin("/content")];

    expect(started.map((current) => current())).toEqual([false, false, true]);
  });
});
