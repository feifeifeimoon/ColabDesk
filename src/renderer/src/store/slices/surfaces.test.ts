/**
 * The confirmation surface: one question at a time, and the caller waits for
 * the answer. The promise is the point — an async action must be able to
 * resume after a render — so it is tested apart from any component.
 */

import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import type { SurfacesSlice } from "../types";
import { createSurfacesSlice } from "./surfaces";

function surfacesStore() {
  return createStore<SurfacesSlice>()((set, get, api) =>
    createSurfacesSlice(set as never, get as never, api as never),
  );
}

const question = {
  title: "停止「alpha」？",
  body: "未保存的运行时数据会丢失。",
  confirmLabel: "停止会话",
  destructive: true,
};

describe("requestConfirmation", () => {
  it("keeps the question until the answer and resolves with it", async () => {
    const store = surfacesStore();
    const answer = store.getState().requestConfirmation(question);

    expect(store.getState().confirmation?.title).toBe("停止「alpha」？");

    store.getState().resolveConfirmation(true);
    await expect(answer).resolves.toBe(true);
    expect(store.getState().confirmation).toBeNull();
  });

  it("a second question cancels the first instead of leaving it waiting", async () => {
    const store = surfacesStore();
    const first = store.getState().requestConfirmation(question);
    const second = store.getState().requestConfirmation({
      title: "关闭全部标签？",
      body: "有未保存的文件修改。",
      confirmLabel: "关闭全部标签",
    });

    await expect(first).resolves.toBe(false);
    expect(store.getState().confirmation?.title).toBe("关闭全部标签？");

    store.getState().resolveConfirmation(true);
    await expect(second).resolves.toBe(true);
  });

  it("resolving with no question pending is a no-op", () => {
    const store = surfacesStore();
    expect(() => store.getState().resolveConfirmation(true)).not.toThrow();
    expect(store.getState().confirmation).toBeNull();
  });
});
