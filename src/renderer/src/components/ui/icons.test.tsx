/**
 * The chrome's icons must be distinguishable from one another.
 *
 * This is the rule the icon sheet used to be checked by eye, and it exists
 * because it has been broken: a "circle with rays" gear reads as the theme
 * toggle's sun at 15px. What can be asserted is the drawing — two icons that
 * put the same lines in the same box are the same icon, whatever they are
 * called.
 */

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

/** Fixed, so two icons can only differ in what they draw. */
const SIZE = 16;

/**
 * Drawings more than one icon is allowed to use.
 *
 * An X is an X: the tab's close and the window's close are the same glyph at
 * different sizes, and they never sit side by side, so they cannot be mistaken
 * for each other. The rule this file defends is about icons sharing a context —
 * the top bar, where a gear once read as the theme toggle's sun.
 */
const DELIBERATE_TWINS: string[][] = [["CloseIcon", "CloseWindowIcon"]];

const drawings = Object.entries(icons)
  .filter(([name]) => name.endsWith("Icon"))
  .map(([name, icon]) => ({
    name,
    markup: renderToStaticMarkup(
      createElement(icon as ComponentType<{ size?: number }>, { size: SIZE }),
    ),
  }));

describe("chrome icons", () => {
  it("draws every one of them differently, bar the deliberate twins", () => {
    const groups = new Map<string, string[]>();
    for (const { name, markup } of drawings) {
      groups.set(markup, [...(groups.get(markup) ?? []), name]);
    }

    const allowed = DELIBERATE_TWINS.map((names) => [...names].sort().join());
    for (const names of groups.values()) {
      if (names.length === 1) continue;
      expect(allowed, `${names.join(" 与 ")} 画的是同一个图形`).toContain([...names].sort().join());
    }

    // A sanity check on the enumeration itself: a rename that stops matching
    // the filter would otherwise make this test pass by testing nothing.
    expect(drawings.length).toBeGreaterThan(15);
  });

  it("honours the size it is asked for", () => {
    const markup = renderToStaticMarkup(createElement(icons.SettingsIcon, { size: 15 }));

    expect(markup).toContain('width="15"');
    expect(markup).toContain('height="15"');
  });

  it("hides itself from assistive technology", () => {
    // Every icon sits next to a label or an aria-label; announcing the glyph
    // as well would read the control twice.
    for (const { name, markup } of drawings) {
      expect(markup, `${name} 没有 aria-hidden`).toContain('aria-hidden="true"');
    }
  });
});
