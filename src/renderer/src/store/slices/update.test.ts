/**
 * The one piece of judgement in this slice: when a dismissal stops applying.
 *
 * It is easy to get backwards in a way nothing else notices — the prompt simply
 * reappears, or never does — so both directions are pinned here.
 */

import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import type { AppState } from "../types";
import { createUpdateSlice } from "./update";

function store() {
  // Only the update slice is assembled; the rest of AppState is never touched
  // by the methods under test.
  return createStore<AppState>()((...args) => createUpdateSlice(...args) as AppState);
}

describe("dismissing a version", () => {
  it("keeps the dismissal for the version that was waved away", () => {
    const app = store();
    app.getState().setUpdateStatus({ state: "available", version: "0.4.0" });
    app.getState().dismissUpdate("0.4.0");
    app.getState().setUpdateStatus({ state: "available", version: "0.4.0" });
    expect(app.getState().dismissedVersion).toBe("0.4.0");
  });

  it("drops the dismissal once a different version turns up", () => {
    const app = store();
    app.getState().dismissUpdate("0.4.0");
    app.getState().setUpdateStatus({ state: "available", version: "0.5.0" });
    expect(app.getState().dismissedVersion).toBeNull();
  });

  it("does not let a failure without a version un-dismiss anything", () => {
    // A background check that never got as far as a version carries
    // `version: null`. Reading that as "a different version" would quietly
    // undo the dismissal and bring the prompt back on the next success.
    const app = store();
    app.getState().dismissUpdate("0.4.0");
    app.getState().setUpdateStatus({
      state: "error",
      reason: "network",
      detail: "net::ERR_INTERNET_DISCONNECTED",
      userInitiated: false,
      version: null,
    });
    expect(app.getState().dismissedVersion).toBe("0.4.0");
  });

  it("does not let a check in progress un-dismiss anything either", () => {
    const app = store();
    app.getState().dismissUpdate("0.4.0");
    app.getState().setUpdateStatus({ state: "checking", userInitiated: false });
    expect(app.getState().dismissedVersion).toBe("0.4.0");
  });

  it("does not let a download of the dismissed version un-dismiss it", () => {
    const app = store();
    app.getState().dismissUpdate("0.4.0");
    app.getState().setUpdateStatus({ state: "downloading", version: "0.4.0", percent: 10 });
    expect(app.getState().dismissedVersion).toBe("0.4.0");
  });
});
