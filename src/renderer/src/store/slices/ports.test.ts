/**
 * The renderer half of the connection-consumer rule.
 *
 * `release` in the workspace slice keeps the connection while a forward is
 * active; these cover the inverse — the last forward stopping after the last
 * tab closed has to hang up, or the app holds the runtime's single SSH slot for
 * nothing.
 */

import type { PortForward } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import type { PortsSlice, WorkspaceTab } from "../types";

vi.mock("../../lib/api", () => ({
  sshDisconnect: vi.fn(),
  stopAllPortForwards: vi.fn(() => Promise.resolve()),
  forgetPortForwards: vi.fn(() => Promise.resolve()),
}));

import { forgetPortForwards, sshDisconnect, stopAllPortForwards } from "../../lib/api";
import { createPortsSlice } from "./ports";

type TestState = PortsSlice & {
  tabs: WorkspaceTab[];
  notify: (toast: { tone: string; text: string }) => void;
};

function testStore(tabs: WorkspaceTab[] = []) {
  return createStore<TestState>()((set, get, api) => ({
    tabs,
    notify: vi.fn(),
    ...createPortsSlice(set as never, get as never, api as never),
  }));
}

function forward(overrides: Partial<PortForward> = {}): PortForward {
  return {
    id: "p1",
    session: "alpha",
    remote_host: "127.0.0.1",
    remote_port: 8000,
    local_host: "127.0.0.1",
    local_port: 52431,
    requested_local_port: null,
    scheme: "http",
    status: "active",
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(sshDisconnect).mockClear();
  vi.mocked(stopAllPortForwards).mockClear();
  vi.mocked(forgetPortForwards).mockClear();
});

describe("the ports connection-consumer rule", () => {
  it("hangs up when the last forward is stopped and no tab is left", () => {
    const store = testStore();
    store.getState().setPorts("alpha", [forward({ status: "stopped", local_port: null })]);
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });

  it("stays connected while a forward is active", () => {
    const store = testStore();
    store.getState().setPorts("alpha", [forward()]);
    expect(sshDisconnect).not.toHaveBeenCalled();
  });

  it("stays connected while a tab needs the same connection", () => {
    const store = testStore([{ session: "alpha" } as never]);
    store.getState().setPorts("alpha", [forward({ status: "stopped", local_port: null })]);
    expect(sshDisconnect).not.toHaveBeenCalled();
  });

  it("stops every mapping on hang-up but keeps the rows, then releases", () => {
    const store = testStore();
    store.getState().setPorts("alpha", [forward()]);
    store.getState().stopAllPorts("alpha");

    expect(stopAllPortForwards).toHaveBeenCalledWith("alpha");
    expect(store.getState().portsBySession.alpha?.[0]?.status).toBe("stopped");
    expect(store.getState().portsBySession.alpha?.[0]?.local_port).toBeNull();
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });

  it("forgets a vanished session in the main process, not just the mirror", () => {
    const store = testStore();
    store.getState().setPorts("alpha", [forward({ status: "stopped", local_port: null })]);
    store.getState().forgetPorts("alpha");

    expect(forgetPortForwards).toHaveBeenCalledWith("alpha");
    expect(store.getState().portsBySession.alpha).toBeUndefined();
  });
});
