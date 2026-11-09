import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import { listTabMoveDestinations } from "src/view/browser/state/tabs/tab-store-selectors";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import type { Tab } from "src/view/browser/types";
import { describe, expect, it } from "vite-plus/test";

function tab(id: string, overrides: Partial<Tab> = {}): Tab {
  return {
    id,
    history: [{ type: "boardList", title: "ホーム" }],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    ...overrides,
  };
}

function createState(): TabStoreState {
  return {
    panes: [
      { id: "main-1", tabs: [tab("a"), tab("b")], activeTabId: "a" },
      { id: "main-2", tabs: [tab("c")], activeTabId: "c" },
      { id: "aux-1", windowId: "aux", tabs: [tab("d")], activeTabId: "d" },
    ],
    activePaneId: "main-1",
    windows: [
      { id: "main", kind: "main", activePaneId: "main-1" },
      { id: "aux", kind: "aux", activePaneId: "aux-1" },
    ],
    closedTabs: [],
  };
}

describe("タブの移動先", () => {
  it("本窓、別窓の順に、元のペインを除いて並べる", () => {
    expect(listTabMoveDestinations(createState(), "a")).toEqual([
      { windowId: "main", paneId: "main-2", label: "反対側のペインへ移動" },
      { windowId: "aux", paneId: "aux-1", label: "別窓1へ移動" },
    ]);
    expect(listTabMoveDestinations(createState(), "d")).toEqual([
      { windowId: "main", paneId: "main-1", label: "メイン画面のペイン1へ移動" },
      { windowId: "main", paneId: "main-2", label: "メイン画面のペイン2へ移動" },
    ]);
  });

  it("存在しないタブには移動先がない", () => {
    expect(listTabMoveDestinations(createState(), "missing")).toEqual([]);
  });
});

describe("移動してもタブの状態が失われない", () => {
  it.each(["left", "right"] as const)("同じペインのタブを%s側へ分割して移す", (side) => {
    const moving = tab("moving", { autoRefreshEnabled: true });
    const state: TabStoreState = {
      ...createState(),
      panes: [{ id: "main-1", tabs: [moving, tab("stay")], activeTabId: "moving" }],
      windows: [{ id: "main", kind: "main", activePaneId: "main-1" }],
    };
    const next = tabReducer(state, {
      type: "TRANSFER_TAB",
      tabId: "moving",
      to: { windowId: "main", splitPaneId: "main-1", newPaneId: "new", side },
    });
    expect(next.panes.map((pane) => pane.id)).toEqual(
      side === "left" ? ["new", "main-1"] : ["main-1", "new"],
    );
    expect(next.panes.find((pane) => pane.id === "new")?.tabs[0]).toBe(moving);
    expect(next.activePaneId).toBe("new");
  });

  it("分割数の上限に達している場合はタブを動かさない", () => {
    const state = createState();
    expect(
      tabReducer(state, {
        type: "TRANSFER_TAB",
        tabId: "a",
        to: { windowId: "main", splitPaneId: "main-1", newPaneId: "new", side: "right" },
      }),
    ).toBe(state);
  });
  it("ペイン、別窓、別のペインへ移しても同じタブ実体のまま保たれる", () => {
    const original = tab("moving", {
      autoRefreshEnabled: true,
      autoRefreshPageKey: "page-key",
      reloadKey: 3,
    });
    let state: TabStoreState = {
      ...createState(),
      panes: [
        { id: "main-1", tabs: [original, tab("b")], activeTabId: "moving" },
        { id: "main-2", tabs: [tab("c")], activeTabId: "c" },
        { id: "aux-1", windowId: "aux", tabs: [tab("d")], activeTabId: "d" },
      ],
    };

    for (const destination of [
      { windowId: "main", paneId: "main-2", index: 1 },
      { windowId: "aux", paneId: "aux-1", index: 1 },
      { windowId: "main", paneId: "main-1", index: 0 },
    ]) {
      state = tabReducer(state, { type: "TRANSFER_TAB", tabId: "moving", to: destination });
      const owner = state.panes.find((pane) => pane.id === destination.paneId);
      expect(owner?.tabs.find((candidate) => candidate.id === "moving")).toBe(original);
      expect(owner?.activeTabId).toBe("moving");
      expect(state.activePaneId).toBe(destination.paneId);
    }
    // どの窓にも、同じIDのタブが複数残らない。
    expect(state.panes.flatMap((pane) => pane.tabs).filter((t) => t.id === "moving")).toHaveLength(
      1,
    );
  });

  it("固定タブは別のペインへ移せない", () => {
    const state: TabStoreState = {
      ...createState(),
      panes: [
        { id: "main-1", tabs: [tab("pin", { pinned: true }), tab("b")], activeTabId: "pin" },
        { id: "main-2", tabs: [tab("p2", { pinned: true }), tab("c")], activeTabId: "c" },
      ],
      windows: [{ id: "main", kind: "main", activePaneId: "main-1" }],
    };
    expect(
      tabReducer(state, {
        type: "TRANSFER_TAB",
        tabId: "pin",
        to: { windowId: "main", paneId: "main-2", index: 99 },
      }),
    ).toBe(state);
  });
});
