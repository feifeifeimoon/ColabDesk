/**
 * The replies a terminal owes a program that asks about its colours.
 *
 * xterm 6.0.0 answers neither, so this is the module that decides what a tool
 * like `bat` is told — which makes the strings, not the wiring, the subject.
 */

import { describe, expect, it } from "vitest";
import type { ITheme } from "@xterm/xterm";
import { answerColorQueries } from "./terminal-color-reply";

/** A terminal reduced to what answering needs: hooks and an output. */
function fakeTerminal() {
  const handlers = new Map<number, (data: string) => boolean>();
  const sent: { data: string; wasUserInput: boolean | undefined }[] = [];
  return {
    host: {
      parser: {
        registerOscHandler: (ident: number, callback: (data: string) => boolean) => {
          handlers.set(ident, callback);
          return {
            dispose: () => {
              handlers.delete(ident);
            },
          };
        },
      },
      input: (data: string, wasUserInput?: boolean) => {
        sent.push({ data, wasUserInput });
      },
    },
    handlers,
    sent,
  };
}

const palette = (background: string, foreground: string): (() => ITheme) => {
  return () => ({ background, foreground }) as ITheme;
};

const dark = palette("#1a1b26", "#c0caf5");

describe("answering the colour queries", () => {
  it("tells OSC 11 what the background is, in the form xterm formats", () => {
    const { host, handlers, sent } = fakeTerminal();
    answerColorQueries(host, dark);

    expect(handlers.get(11)?.("?")).toBe(true);
    expect(sent).toEqual([{ data: "\x1b]11;rgb:1a1a/1b1b/2626\x1b\\", wasUserInput: false }]);
  });

  it("tells OSC 10 what the foreground is", () => {
    const { host, handlers, sent } = fakeTerminal();
    answerColorQueries(host, dark);

    expect(handlers.get(10)?.("?")).toBe(true);
    expect(sent).toEqual([{ data: "\x1b]10;rgb:c0c0/caca/f5f5\x1b\\", wasUserInput: false }]);
  });

  it("stays out of the way of a program setting a colour", () => {
    const { host, handlers, sent } = fakeTerminal();
    answerColorQueries(host, dark);

    // Setting (`\x1b]11;rgb:…`) belongs to xterm's own handler, which fires the
    // event the library leaves to the embedder. Falling through keeps that path.
    expect(handlers.get(11)?.("rgb:1/1/1")).toBe(false);
    expect(handlers.get(10)?.("rgb:1/1/1")).toBe(false);
    expect(sent).toEqual([]);
  });

  it("reads the palette at the moment of the question, not at hook time", () => {
    const { host, handlers, sent } = fakeTerminal();
    let current = dark;
    answerColorQueries(host, () => current());

    current = palette("#eff1f5", "#4c4f69");
    handlers.get(11)?.("?");

    // A light palette that changed after the session started still answers with
    // the colour on screen now.
    expect(sent[0]?.data).toBe("\x1b]11;rgb:efef/f1f1/f5f5\x1b\\");
  });

  it("leaves a colour it cannot format unanswered rather than guessing", () => {
    const { host, handlers, sent } = fakeTerminal();
    answerColorQueries(host, palette("rgba(0, 0, 0, 0.5)", "#fff"));

    expect(handlers.get(11)?.("?")).toBe(true);
    expect(sent).toEqual([]);
  });

  it("unhooks itself when the terminal goes", () => {
    const { host, handlers } = fakeTerminal();
    const subscription = answerColorQueries(host, dark);
    expect(handlers.size).toBe(2);

    subscription.dispose();

    expect(handlers.size).toBe(0);
  });
});
