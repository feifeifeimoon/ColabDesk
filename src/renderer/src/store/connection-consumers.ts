/**
 * Whether a session's SSH connection still has a consumer.
 *
 * A runtime takes one connection at a time, so holding it is a decision shared
 * by two slices: the workspace lets go when the last tab closes, and the ports
 * slice lets go when the last forward stops. Both must count the other's
 * consumers, or one of them hangs up on a connection the other is using.
 */

import type { AppState } from "./types";

export function needsConnection(
  state: Pick<AppState, "tabs" | "portsBySession">,
  session: string,
): boolean {
  if (state.tabs.some((tab) => tab.session === session)) return true;
  // A stopped forward is a definition waiting for a click, not a consumer.
  // The optional access keeps slice-level test stores working without ports.
  return (state.portsBySession?.[session] ?? []).some(
    (forward) => forward.status === "starting" || forward.status === "active",
  );
}
