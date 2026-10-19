/**
 * The runtime-setup surface: what `colab new` was asked for, and what it said
 * while it ran.
 *
 * The state is here rather than in the component because the surface is a view.
 * Leaving it — clicking a tab, pressing Escape — must not abandon a request
 * that is already in flight, and a failure has to be somewhere when the person
 * comes back. The request itself never retries: creating is a side effect.
 */

import type { CommandReport } from "@shared/types";
import type { StateCreator } from "zustand";
import { translate } from "../../i18n/i18n";
import * as api from "../../lib/api";
import { failureHint, failureLabel, failureReason } from "../../lib/failure";
import type { AppState, CreationSlice, CreationState } from "../types";

const BLANK: CreationState = {
  open: false,
  phase: "setup",
  request: null,
  startedAt: null,
  lines: [],
  error: null,
};

/**
 * What a failed create says, in the order this app prefers to say it.
 *
 * When the CLI's own last line is already on screen (the surface streams it),
 * the red line is the *status* only — `failureLabel` — because repeating the
 * reason underneath the sentence that gave it reads as two failures.
 */
export function creationFailure(report: CommandReport, streamed: string[]): string {
  if (report.timed_out) return translate("sessions.timeoutCallout", "命令超时，已终止。稍后同步即可查看结果。");
  if (report.error) return report.error;
  const label = failureLabel(report.code);
  const reason = failureHint(report.output) ?? failureReason(report.output);
  if (!reason) return label;
  return streamed.some((line) => line.includes(reason)) ? label : `${label}${reason}`;
}

export const createCreationSlice: StateCreator<AppState, [], [], CreationSlice> = (set, get) => ({
  creation: { ...BLANK },

  openNewSession: () => set({ creation: { ...get().creation, open: true } }),
  closeNewSession: () => set({ creation: { ...get().creation, open: false } }),

  /**
   * The CLI prints a handful of lines, not a stream of bytes — nothing like the
   * terminal's output path, which stays out of the store for exactly that reason.
   */
  appendCreationLine: (line) => {
    const { creation } = get();
    if (creation.phase !== "provisioning") return;
    set({ creation: { ...creation, lines: [...creation.lines, line] } });
  },

  startCreation: async (request) => {
    set({
      creation: { open: true, phase: "provisioning", request, startedAt: Date.now(), lines: [], error: null },
    });

    let report: CommandReport;
    try {
      report = await api.createSession(request);
    } catch (cause) {
      report = { ok: false, code: null, timed_out: false, output: "", error: api.messageOf(cause), attempts: 1 };
    }

    if (report.ok) {
      // The next opening starts from a blank form; `sessionCreated` closes the
      // view and opens the session that just appeared.
      set({ creation: { ...BLANK } });
      await get().sessionCreated(request.name?.trim() || null);
      return;
    }

    const error = creationFailure(report, get().creation.lines);
    set({ creation: { ...get().creation, phase: "failed", error } });
    // A failure that lands while the surface is closed must not vanish with it.
    if (!get().creation.open) get().notify({ tone: "danger", text: error });
  },
});
