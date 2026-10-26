/**
 * What a refresh of the session list does to the workbench.
 *
 * `pruneTabs` belongs to the workspace slice, but *when* it runs belongs here:
 * the list is the only thing that knows which sessions exist, and a session the
 * list no longer has must take its shells and the rail's selection with it —
 * otherwise the workbench goes on describing a session that is not there.
 *
 * The read is also the only place that knows whether it knows anything: a file
 * that could not be read says nothing about which sessions exist, so it retires
 * nothing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import type { EnvironmentSlice, SessionsSlice, SurfacesSlice, WorkspaceSlice } from "../types";
import { createEnvironmentSlice } from "./environment";
import { createSessionsSlice } from "./sessions";
import { createSurfacesSlice } from "./surfaces";
import { createWorkspaceSlice } from "./workspace";

vi.mock("../../lib/api", () => ({
  sshDisconnect: vi.fn(),
  listSessions: vi.fn(),
  messageOf: (cause: unknown) => (cause as Error).message,
}));
import { listSessions } from "../../lib/api";

type TestState = WorkspaceSlice & SessionsSlice & EnvironmentSlice & SurfacesSlice;

function appStore() {
  return createStore<TestState>()((set, get, api) => ({
    ...createWorkspaceSlice(set as never, get as never, api as never),
    ...createSessionsSlice(set as never, get as never, api as never),
    ...createEnvironmentSlice(set as never, get as never, api as never),
    ...createSurfacesSlice(set as never, get as never, api as never),
  }));
}

/** Only the name matters to the tab bookkeeping. */
const named = (name: string) => ({ name }) as TestState["sessions"][number];

beforeEach(() => vi.mocked(listSessions).mockReset());

describe("loadSessions", () => {
  it("retires the shells of a session the list no longer has", async () => {
    const store = appStore();
    store.getState().openTab("alpha");
    store.getState().openTab("beta");
    store.getState().openSession("alpha");
    vi.mocked(listSessions).mockResolvedValue({ sessions: [named("beta")], error: null });

    await store.getState().loadSessions();

    expect(store.getState().tabs.map((tab) => tab.session)).toEqual(["beta"]);
    expect(store.getState().selectedSession).toBeNull();
  });

  it("retires nothing when the list could not be read", async () => {
    const store = appStore();
    store.getState().openTab("alpha");
    vi.mocked(listSessions).mockResolvedValue({
      sessions: [],
      error: "解析 sessions.json 失败: Unexpected end of JSON input",
    });

    await store.getState().loadSessions();

    // The shell is still live, so the shell stays — and so does the selection
    // that says where it is.
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().selectedSession).toBe("alpha");
    expect(store.getState().error).toContain("解析 sessions.json 失败");
  });
});

describe("runSessionAction", () => {
  it("关闭全部标签先问，取消就不动，确认才关", async () => {
    const store = appStore();
    store.getState().openFileTab("alpha", "/content/notes.txt", "notes.txt");
    const tab = store.getState().tabs[0]!;
    store.getState().setTabDirty(tab.id, true);

    const asked = store.getState().runSessionAction("alpha", "close-all");
    expect(store.getState().confirmation?.title).toBe("关闭「alpha」的全部标签？");

    store.getState().resolveConfirmation(false);
    await asked;
    expect(store.getState().tabs).toHaveLength(1);

    const confirmed = store.getState().runSessionAction("alpha", "close-all");
    store.getState().resolveConfirmation(true);
    await confirmed;
    expect(store.getState().tabs).toHaveLength(0);
  });
});
