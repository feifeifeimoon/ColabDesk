/**
 * The last two places an error can go without anyone seeing it.
 *
 * A packaged app has no console: an exception thrown out of a timer, or a
 * rejection out of a background task, takes the process down and leaves nothing
 * behind but a window that stopped responding. Both get a line in the log here
 * — and the process is then allowed to do what it would have done anyway, with
 * one deliberate exception noted below.
 */

import { describeError, type LogSink } from "./log-file";

export function installProcessErrorGuards(log: LogSink): void {
  const onUncaught = (error: Error): void => {
    log.write("crash", `uncaught exception: ${describeError(error)}`);
    // Not a state to keep running in, so the process still dies — but by way of
    // Node's own handler, which prints the stack we just wrote down. Ours has to
    // go first: leaving it installed would catch the second throw as well.
    process.removeListener("uncaughtException", onUncaught);
    throw error;
  };
  process.on("uncaughtException", onUncaught);

  process.on("unhandledRejection", (reason) => {
    // Deliberately not fatal. Node's default is to exit, and an Electron main
    // process that exits over a background rejection is indistinguishable, from
    // the user's side, from a crash: the window is gone with nothing to read.
    // One line here, and whatever was waiting on that promise stays broken.
    log.write("crash", `unhandled rejection: ${describeError(reason)}`);
  });
}
