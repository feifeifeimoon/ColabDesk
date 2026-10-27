import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import { failureHint, failureLabel } from "../../lib/failure";
import { translate } from "../../i18n/i18n";
import type { AppState, SessionsSlice } from "../types";

/**
 * Both halves of the rail: the records on disk and the server's own list. They
 * are independent reads — the second one is a network round trip — so neither
 * is made to wait for the other.
 */
async function loadRail(get: () => AppState): Promise<void> {
  await Promise.all([get().loadSessions(), get().loadUntracked()]);
}

/** Whether this session has a file tab holding edits the runtime does not have. */
function hasUnsavedEdits(get: () => AppState, session: string): boolean {
  const { tabs, dirtyTabs } = get();
  return tabs.some((tab) => tab.session === session && dirtyTabs[tab.id] === true);
}

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set, get) => ({
  sessions: [],
  sessionsLoading: true,
  sessionsSyncing: false,
  untrackedSessions: [],
  untrackedError: null,
  runtimeEndpoints: null,
  busyAction: null,

  loadSessions: async () => {
    try {
      const result = await api.listSessions();
      set({ sessions: result.sessions });
      // The list is still shown when it could not be read; the banner says the
      // stale file is what is on screen.
      if (result.error) set({ error: result.error });
      // Only a list that was actually read knows which sessions exist — a read
      // that failed would take every live shell down with it. Every refresh
      // (first paint, sync, stop, create) comes through here, which is what
      // makes this the place that retires what the list no longer has.
      else get().pruneTabs();
    } catch (cause) {
      set({ error: api.messageOf(cause) });
    } finally {
      set({ sessionsLoading: false });
    }
  },

  /**
   * The runtimes the server has that the local store does not, and — from the
   * same answer — which runtimes it has at all. A failure here is deliberately
   * not a banner: this read loses to every network blip, and what the person
   * needs to know is that the *list* may be short, which the rail says in place
   * of an empty state that would claim there is nothing. The rows themselves go
   * quiet on a failure: `null` is "not answered", never "not there".
   */
  loadUntracked: async () => {
    try {
      const result = await api.listUntracked();
      set({
        untrackedSessions: result.sessions,
        untrackedError: result.error,
        runtimeEndpoints: result.live_endpoints,
      });
    } catch (cause) {
      set({ untrackedSessions: [], untrackedError: api.messageOf(cause), runtimeEndpoints: null });
    }
  },

  syncSessions: async () => {
    set({ sessionsSyncing: true });
    try {
      const report = await api.syncSessions();
      if (!report.ok && !report.error) set({ error: report.output.trim() || translate("sessions.syncFailed", "同步失败。") });
      else set({ error: report.error });
      // Both reads wait for that call — it is what prunes the store and mints a
      // fresh token — but they do not wait for each other.
      await Promise.all([loadRail(get), get().refreshEnvironment()]);
      // The sync pruned every record the current account does not have, so the
      // rail no longer needs to explain whose they were.
      if (report.ok) get().clearPreviousAccount();
    } catch (cause) {
      set({ error: api.messageOf(cause) });
    } finally {
      set({ sessionsSyncing: false });
    }
  },

  /**
   * The session row's actions. Destructive work (stopping a runtime) confirms
   * first and reports its outcome where the user is looking.
   */
  runSessionAction: async (name, action) => {
    if (action === "open") {
      get().openSession(name);
      return;
    }
    if (action === "new-terminal") {
      get().openTab(name);
      return;
    }
    if (action === "close-all") {
      // Closing every tab is how the session's connection is let go — and a
      // file tab can be holding edits. Asked once, the way stopping asks:
      // nothing else in this app can lose work without a question.
      if (hasUnsavedEdits(get, name)) {
        const confirmed = await get().requestConfirmation({
          title: translate("sessions.closeAllTitle", `关闭「${name}」的全部标签？`, { name }),
          body: translate("sessions.closeAllBody", "有未保存的文件修改，关闭会丢失它们。"),
          confirmLabel: translate("sessions.closeAllAction", "关闭全部标签"),
          destructive: true,
        });
        if (!confirmed) return;
      }
      get().closeSessionTabs(name);
      return;
    }
    if (action === "stop") {
      const unsaved = hasUnsavedEdits(get, name);
      const confirmed = await get().requestConfirmation({
        title: translate("sessions.stopTitle", `停止「${name}」？`, { name }),
        body: unsaved
          ? translate("sessions.stopBodyDirty", "未保存的运行时数据与文件修改都会丢失。")
          : translate("sessions.stopBody", "未保存的运行时数据会丢失。"),
        confirmLabel: translate("sessions.stopAction", "停止会话"),
        destructive: true,
      });
      if (!confirmed) return;
    }

    set({ busyAction: `${name}:${action}` });
    try {
      if (action === "stop") {
        const report = await api.stopSession(name);
        if (report.error) get().notify({ tone: "danger", text: report.error });
        else if (report.timed_out)
          get().notify({ tone: "warn", text: translate("sessions.stopTimeout", "停止命令超时；请稍后同步会话查看结果。") });
        else if (!report.ok)
          get().notify({ tone: "danger", text: `${failureLabel(report.code)}${failureHint(report.output) ?? ""}` });
        else {
          get().notify({ tone: "info", text: translate("sessions.stoppedSuccess", `会话「${name}」已停止。`, { name }) });
          get().closeSessionTabs(name);
        }
        await Promise.all([loadRail(get), get().refreshEnvironment()]);
      } else if (action === "restart-kernel") {
        const report = await api.restartKernel(name);
        if (report.error) get().notify({ tone: "danger", text: report.error });
        else if (report.timed_out)
          get().notify({ tone: "warn", text: translate("sessions.restartTimeout", "重启命令超时，请稍后重试。") });
        else if (!report.ok)
          get().notify({ tone: "danger", text: `${failureLabel(report.code)}${failureHint(report.output) ?? ""}` });
        else get().notify({ tone: "info", text: translate("sessions.restartedSuccess", `已重启「${name}」的内核。`, { name }) });
      }
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    } finally {
      set({ busyAction: null });
    }
  },

  sessionCreated: async (name) => {
    const before = new Set(get().sessions.map((session) => session.name));
    get().closeNewSession();
    await Promise.all([loadRail(get), get().refreshEnvironment()]);
    if (name) {
      get().openSession(name);
      return;
    }
    // The CLI generates the name; open whatever appeared in this round trip.
    const created = (await api.listSessions()).sessions.find((session) => !before.has(session.name));
    if (created) get().openSession(created.name);
  },

});
