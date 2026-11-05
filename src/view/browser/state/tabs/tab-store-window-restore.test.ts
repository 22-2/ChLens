import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { createHomeTab } from "src/view/browser/types";
import { describe, expect, it } from "vite-plus/test";

function createState(): TabStoreState {
  return {
    panes: [
      { id: "main-pane", tabs: [createHomeTab("main-tab")], activeTabId: "main-tab" },
      {
        id: "aux-pane",
        windowId: "aux",
        tabs: [createHomeTab("aux-1"), createHomeTab("aux-2")],
        activeTabId: "aux-2",
      },
    ],
    activePaneId: "aux-pane",
    windows: [
      { id: "main", kind: "main", activePaneId: "main-pane" },
      { id: "aux", kind: "aux", activePaneId: "aux-pane" },
    ],
    bottomPanels: { "aux-pane": { isOpen: true } },
    closedTabs: [],
  };
}

describe("別窓の本窓への集約", () => {
  it("窓内のタブを閉じた履歴に積まず、本窓の選択ペインの末尾へ集める", () => {
    const next = tabReducer(createState(), { type: "COLLAPSE_WORKSPACE_WINDOW", windowId: "aux" });
    expect(next.windows.map((item) => item.id)).toEqual(["main"]);
    expect(next.panes).toHaveLength(1);
    expect(next.panes[0].tabs.map((tab) => tab.id)).toEqual(["main-tab", "aux-1", "aux-2"]);
    expect(next.closedTabs).toEqual([]);
    expect(next.activePaneId).toBe("main-pane");
    expect(next.bottomPanels).toEqual({});
  });

  it("本窓や存在しない窓は集約の対象にしない", () => {
    const state = createState();
    expect(tabReducer(state, { type: "COLLAPSE_WORKSPACE_WINDOW", windowId: "main" })).toBe(state);
    expect(tabReducer(state, { type: "COLLAPSE_WORKSPACE_WINDOW", windowId: "none" })).toBe(state);
  });
});

describe("別窓の位置と大きさ", () => {
  const bounds = { left: 10, top: 20, width: 800, height: 600 };

  it("窓の位置と大きさを記録し、同じ値なら状態を変えない", () => {
    const state = createState();
    const next = tabReducer(state, {
      type: "SET_WORKSPACE_WINDOW_BOUNDS",
      windowId: "aux",
      bounds,
    });
    expect(next.windows.find((item) => item.id === "aux")?.bounds).toEqual(bounds);
    expect(
      tabReducer(next, {
        type: "SET_WORKSPACE_WINDOW_BOUNDS",
        windowId: "aux",
        bounds: { ...bounds },
      }),
    ).toBe(next);
  });

  it("存在しない窓の位置は記録しない", () => {
    const state = createState();
    expect(
      tabReducer(state, { type: "SET_WORKSPACE_WINDOW_BOUNDS", windowId: "none", bounds }),
    ).toBe(state);
  });
});
