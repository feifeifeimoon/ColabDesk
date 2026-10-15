import { describe, expect, it } from "vitest";
import { makeOutputFrames, type OutputFrame } from "./output-frames";

/** A scheduler that only runs when the test says so. */
function manualSchedule() {
  let queued: (() => void) | null = null;
  return {
    schedule: (run: () => void) => {
      queued = run;
    },
    runNow: () => {
      const run = queued;
      queued = null;
      run?.();
    },
  };
}

function collect() {
  const frames: OutputFrame[] = [];
  const clock = manualSchedule();
  return {
    frames,
    clock,
    frames_under_test: makeOutputFrames((frame) => frames.push(frame), clock.schedule),
  };
}

const chunk = (text: string): Buffer => Buffer.from(text, "utf8");

describe("output frames", () => {
  it("holds a burst until the frame is due, then sends it as one message", () => {
    const { frames, clock, frames_under_test } = collect();

    frames_under_test.push(1, "alpha", chunk("one "));
    frames_under_test.push(1, "alpha", chunk("two "));
    frames_under_test.push(1, "alpha", chunk("three"));
    expect(frames).toEqual([]);

    clock.runNow();
    expect(frames).toHaveLength(1);
    expect(frames[0].data.toString()).toBe("one two three");
  });

  it("keeps channels apart rather than interleaving them", () => {
    const { frames, clock, frames_under_test } = collect();

    frames_under_test.push(1, "alpha", chunk("a"));
    frames_under_test.push(2, "beta", chunk("b"));
    clock.runNow();

    expect(frames.map((frame) => [frame.channelId, frame.session, frame.data.toString()])).toEqual([
      [1, "alpha", "a"],
      [2, "beta", "b"],
    ]);
  });

  it("sends at once once a channel has filled a frame", () => {
    const { frames, frames_under_test } = collect();

    frames_under_test.push(7, "alpha", Buffer.alloc(64 * 1024, 120));
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toHaveLength(64 * 1024);
  });

  it("can be drained on demand, for a channel that is closing", () => {
    const { frames, frames_under_test } = collect();

    frames_under_test.push(3, "alpha", chunk("bye"));
    frames_under_test.flush();
    expect(frames).toHaveLength(1);
  });
});
