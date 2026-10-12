/**
 * Reads that only make sense when two slices are combined.
 *
 * Every one returns a primitive or a reference already held by the store: a
 * selector that builds a fresh object would make the component re-render on
 * every unrelated write. The one projection that does build an array —
 * the selected session's shells — lives in the component that needs it, memoised
 * on the two values it reads.
 */

import type { Session, SshState } from "@shared/types";
import { useAppStore } from "./index";

/** The accelerator a session actually runs on; the CLI writes `NONE` for CPU. */
export function acceleratorLabel(session: Session): string {
  return session.accelerator === "NONE" || !session.accelerator ? "CPU" : session.accelerator;
}

/** The selected session's connection, which is what the status bar reports. */
export function useActiveConnection(): SshState | null {
  return useAppStore((state) =>
    state.selectedSession ? (state.connections[state.selectedSession] ?? null) : null,
  );
}

export function useActiveAccelerator(): string | null {
  return useAppStore((state) => {
    const active = state.sessions.find((session) => session.name === state.selectedSession);
    return active ? acceleratorLabel(active) : null;
  });
}

/** Where the selected session's file browser is, while that panel is on screen. */
export function useActiveRemotePath(): string | null {
  return useAppStore((state) =>
    state.selectedSession && state.filesOpen
      ? (state.remotePaths[state.selectedSession] ?? null)
      : null,
  );
}

/** Every transfer in flight across sessions: they keep running out of sight. */
export function useTransferCount(): number {
  return useAppStore((state) =>
    Object.values(state.transferCounts).reduce((total, active) => total + active, 0),
  );
}

/** Whether the panel toggles have a layout to act on: a selected session with a shell. */
export function useHasWorkSurface(): boolean {
  return useAppStore((state) =>
    state.tabs.some((tab) => tab.session === state.selectedSession),
  );
}

/** The ssh command for a session, as the CLI's own config writes its alias. */
export function sshCommandFor(session: string): string {
  return `ssh colabdesk-${session}`;
}
